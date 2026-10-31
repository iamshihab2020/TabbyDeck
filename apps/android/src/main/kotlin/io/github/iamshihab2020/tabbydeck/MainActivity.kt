// The older Android APIs used here are the ones that work from Android 5.0 to today.
@file:Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")

package io.github.iamshihab2020.tabbydeck

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.window.OnBackInvokedDispatcher
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.NetworkInterface
import java.net.Proxy
import java.net.URL
import java.util.Collections
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

private const val PORT = 8191
private const val MIN_CHROME = 60 // the deck's floor, apps/deck/vite.config.ts
private const val PICK = 1

/**
 * Finds TabbyDeck on the Wi-Fi and shows the PC's own deck page full screen. The deck comes from the PC,
 * so the app never falls out of step with it.
 */
class MainActivity : Activity() {
    private lateinit var home: View
    private lateinit var status: TextView
    private lateinit var spin: View
    private lateinit var action: Button
    private lateinit var list: LinearLayout
    private lateinit var manual: View
    private lateinit var address: EditText
    private var web: WebView? = null
    /** host:port of the PC whose deck is loaded. */
    private var pc: String? = null
    /** Bumped by every search, so a stale one cannot change the screen. */
    @Volatile private var searchId = 0
    private var picked: ValueCallback<Array<Uri>>? = null
    private var shooting = false
    private val prefs by lazy { getSharedPreferences("app", MODE_PRIVATE) }

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.main)
        home = findViewById(R.id.home)
        status = findViewById(R.id.status)
        spin = findViewById(R.id.spin)
        action = findViewById(R.id.action)
        list = findViewById(R.id.list)
        manual = findViewById(R.id.manual)
        address = findViewById(R.id.address)
        findViewById<View>(R.id.connect).setOnClickListener { typed() }
        findViewById<View>(R.id.rescan).setOnClickListener { search(auto = false) }
        address.setOnEditorActionListener { _, id, _ -> (id == EditorInfo.IME_ACTION_GO).also { if (it) typed() } }
        action.text = "Back to the deck"
        action.setOnClickListener { home.visibility = View.GONE }
        if (Build.VERSION.SDK_INT >= 33) onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) { back() }
        if (Build.VERSION.SDK_INT >= 30) {
            // Full screen to the edges; keep the deck clear of a camera notch and above the keyboard.
            window.setDecorFitsSystemWindows(false)
            findViewById<View>(R.id.root).setOnApplyWindowInsetsListener { v, insets ->
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                v.setPadding(i.left, i.top, i.right, i.bottom)
                WindowInsets.CONSUMED
            }
        } else {
            // Before Android 11 a full-screen window is not resized for the keyboard, so lift the page above it.
            val root = findViewById<View>(R.id.root)
            root.viewTreeObserver.addOnGlobalLayoutListener {
                val seen = Rect().also { root.getWindowVisibleDisplayFrame(it) }
                val at = IntArray(2).also { root.getLocationOnScreen(it) }
                val under = at[1] + root.height - seen.bottom
                val pad = if (under > root.height / 6) under else 0 // a keyboard, not a navigation bar showing for a moment
                if (root.paddingBottom != pad) root.setPadding(0, 0, 0, pad)
            }
        }
        fit()

        val chrome = webViewVersion()
        if (chrome < MIN_CHROME) return outdated(chrome)
        val saved = prefs.getString("pc", null)
        if (saved != null) connect(saved, auto = true) else search(auto = true)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) immersive()
    }

    override fun onConfigurationChanged(c: Configuration) {
        super.onConfigurationChanged(c)
        fit()
    }

    override fun onPause() { web?.onPause(); super.onPause() }
    override fun onResume() { super.onResume(); web?.onResume() }

    override fun onDestroy() {
        searchId++
        web?.let { (it.parent as? ViewGroup)?.removeView(it); it.destroy() }
        super.onDestroy()
    }

    override fun onBackPressed() = back()

    /** From the deck, Back shows the PC list (the deck stays connected behind it); from the list, it leaves. */
    private fun back() {
        if (home.visibility == View.VISIBLE || pc == null) finish() else showHome()
    }

    private fun immersive() {
        if (Build.VERSION.SDK_INT >= 30) window.insetsController?.run {
            hide(WindowInsets.Type.systemBars())
            systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        } else window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
    }

    /** Keeps the PC list a readable width on a tablet. */
    private fun fit() {
        val col = findViewById<View>(R.id.column)
        col.layoutParams = col.layoutParams.apply {
            width = if (resources.configuration.screenWidthDp > 500) dp(440) else ViewGroup.LayoutParams.MATCH_PARENT
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun say(text: String, busy: Boolean = false) {
        status.text = text
        spin.visibility = if (busy) View.VISIBLE else View.GONE
    }

    private fun label(at: String) = at.removeSuffix(":$PORT")

    /** The WebView's Chrome version; 0 when the phone has no working WebView. */
    private fun webViewVersion(): Int = try {
        Regex("Chrome/(\\d+)").find(WebSettings.getDefaultUserAgent(this))?.groupValues?.get(1)?.toInt() ?: 0
    } catch (e: Exception) { 0 }

    private fun outdated(version: Int) {
        val pkg = when {
            Build.VERSION.SDK_INT >= 26 -> WebView.getCurrentWebViewPackage()?.packageName ?: "com.google.android.webview"
            Build.VERSION.SDK_INT >= 24 -> "com.android.chrome" // Android 7 shows web pages with Chrome
            else -> "com.google.android.webview"
        }
        manual.visibility = View.GONE
        say(if (version == 0) "TabbyDeck needs Android System WebView to show the deck, and this phone has no working one. Install or turn it on from the Play Store."
            else "Android System WebView on this phone is too old for TabbyDeck: version $version, and it needs $MIN_CHROME or newer. Update it from the Play Store, then open TabbyDeck again.")
        action.text = "Update in the Play Store"
        action.visibility = View.VISIBLE
        action.setOnClickListener {
            for (u in listOf("market://details?id=$pkg", "https://play.google.com/store/apps/details?id=$pkg"))
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u))); break } catch (e: ActivityNotFoundException) {}
        }
    }

    /** True when TabbyDeck answers at host:port; its deck names itself in the web manifest. */
    private fun isDeck(at: String, wait: Int): Boolean = try {
        val c = URL("http://$at/manifest.webmanifest").openConnection(Proxy.NO_PROXY) as HttpURLConnection
        c.connectTimeout = wait
        c.readTimeout = 2000
        c.useCaches = false
        try {
            val buf = CharArray(512)
            c.responseCode == 200 && c.inputStream.reader().use { String(buf, 0, maxOf(it.read(buf), 0)) }.contains("\"TabbyDeck\"")
        } finally { c.disconnect() }
    } catch (e: Exception) { false }

    /** Opens the deck at host:port if TabbyDeck answers there. With auto, a PC that moved is looked for on the Wi-Fi. */
    private fun connect(at: String, auto: Boolean) {
        val id = ++searchId
        say("Connecting to ${label(at)}…", busy = true)
        Thread {
            val ok = isDeck(at, 2500)
            runOnUiThread {
                if (id != searchId) return@runOnUiThread
                when {
                    ok -> open(at)
                    auto -> search(auto = true)
                    else -> say("TabbyDeck did not answer at ${label(at)}. Check the address, and that TabbyDeck is running on the PC.")
                }
            }
        }.start()
    }

    /** Every other address on the phone's home networks. */
    private fun neighbours(): List<String> {
        val out = LinkedHashSet<String>()
        try {
            for (n in NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()) {
                if (!n.isUp || n.isLoopback || n.name.startsWith("rmnet") || n.name.startsWith("ccmni")) continue // mobile data
                for (a in n.interfaceAddresses) {
                    val ip = a.address as? Inet4Address ?: continue
                    if (!ip.isSiteLocalAddress) continue
                    // shortcut: only the 254 addresses sharing the phone's first three numbers; on a bigger network, type the address.
                    val b = ip.address.map { it.toInt() and 0xff }
                    for (i in 1..254) if (i != b[3]) out.add("${b[0]}.${b[1]}.${b[2]}.$i")
                }
            }
        } catch (e: Exception) { /* no network: nothing to look at */ }
        return out.toList()
    }

    /** Looks for TabbyDeck at every address on the Wi-Fi. With auto, opens the PC when it is the only one. */
    private fun search(auto: Boolean) {
        val id = ++searchId
        list.removeAllViews()
        say("Looking for your PC on this Wi-Fi…", busy = true)
        Thread {
            val found = Collections.synchronizedList(ArrayList<String>())
            val pool = Executors.newFixedThreadPool(48)
            for (ip in neighbours()) pool.execute {
                val at = "$ip:$PORT"
                if (id == searchId && isDeck(at, 600)) {
                    found.add(at)
                    runOnUiThread { if (id == searchId) addPc(at) }
                }
            }
            pool.shutdown()
            pool.awaitTermination(30, TimeUnit.SECONDS)
            val all = found.toList()
            runOnUiThread {
                if (id != searchId) return@runOnUiThread
                when {
                    auto && all.size == 1 -> open(all[0])
                    all.isEmpty() -> say("No PC found. Check that TabbyDeck is running on the PC and that this phone is on the same Wi-Fi, or type the address below.")
                    else -> say(if (all.size == 1) "Found your PC." else "Found ${all.size} PCs. Tap yours.")
                }
            }
        }.start()
    }

    private fun addPc(at: String) {
        val b = Button(this, null, 0, R.style.Btn)
        b.text = if (at == pc) "PC at ${label(at)}, open now" else "PC at ${label(at)}"
        b.setOnClickListener { open(at) }
        list.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })
    }

    private fun typed() {
        val t = address.text.toString().trim().substringAfter("://").substringBefore('/')
        if (t.isEmpty()) return
        (getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(address.windowToken, 0)
        connect(if (':' in t) t else "$t:$PORT", auto = false)
    }

    private fun showHome(auto: Boolean = false) {
        home.visibility = View.VISIBLE
        action.visibility = if (pc != null) View.VISIBLE else View.GONE
        search(auto)
    }

    private fun open(at: String) {
        searchId++
        prefs.edit().putString("pc", at).apply()
        val w = web ?: makeWeb().also { web = it }
        if (pc != at) { pc = at; w.loadUrl("http://$at/") }
        home.visibility = View.GONE
        w.requestFocus()
    }

    /** The deck page did not load: the PC may have a new address, so look for it again. */
    private fun lost() {
        pc = null
        showHome(auto = true)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun makeWeb(): WebView {
        if (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0) WebView.setWebContentsDebuggingEnabled(true)
        val w = WebView(this)
        w.setBackgroundColor(0xFF121110.toInt())
        w.settings.run {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false // key sounds and the timer alarm
            textZoom = 100 // labels are sized to their keys; the phone's font size would push them out
            userAgentString = "$userAgentString TabbyDeckApp/${packageManager.getPackageInfo(packageName, 0).versionName}"
        }
        w.addJavascriptInterface(Bridge(), "TabbyAndroid")
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                if (Uri.parse(url).authority == pc) return false
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: ActivityNotFoundException) {}
                return true
            }
            // Called for the page itself only (Android 6 and newer pass only main-frame errors here).
            override fun onReceivedError(view: WebView, code: Int, description: String?, url: String?) = lost()
            // An old tablet short of memory can lose the page's process; start over instead of closing.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean { recreate(); return true }
        }
        w.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                picked?.onReceiveValue(null)
                picked = null
                shooting = params.isCaptureEnabled
                val intent = if (shooting) {
                    Photos.file(this@MainActivity).delete()
                    val out = Photos.uri(this@MainActivity)
                    Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, out)
                        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        .apply { clipData = ClipData.newRawUri(null, out) }
                } else params.createIntent()
                return try { startActivityForResult(intent, PICK); picked = callback; true } catch (e: ActivityNotFoundException) { false }
            }
        }
        findViewById<ViewGroup>(R.id.root).addView(w, 0, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        return w
    }

    // shortcut: if Android closes the app while the camera is open (low memory), the photo is dropped; pick it again.
    override fun onActivityResult(request: Int, result: Int, data: Intent?) {
        if (request != PICK) return super.onActivityResult(request, result, data)
        picked?.onReceiveValue(when {
            result != RESULT_OK -> null
            shooting -> if (Photos.file(this).length() > 0) arrayOf(Photos.uri(this)) else null
            else -> WebChromeClient.FileChooserParams.parseResult(result, data)
        })
        picked = null
    }

    /**
     * window.TabbyAndroid in the deck. Pairing stays in the page's own storage, kept per address by the WebView:
     * a shared store would hand one PC's token to any page that claims to be TabbyDeck at another address.
     */
    inner class Bridge {
        @JavascriptInterface fun changePc() { runOnUiThread { showHome() } }
    }
}
