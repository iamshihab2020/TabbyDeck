package io.github.iamshihab2020.tabbydeck

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File

/** Gives the camera app one file to save a photo in, for the deck's Camera button. Not exported: only the camera gets a grant. */
class Photos : ContentProvider() {
    override fun onCreate() = true
    override fun getType(uri: Uri) = "image/jpeg"
    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor =
        ParcelFileDescriptor.open(file(context!!), ParcelFileDescriptor.parseMode(mode))
    override fun query(uri: Uri, projection: Array<String>?, selection: String?, args: Array<String>?, sort: String?): Cursor =
        MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply { addRow(arrayOf<Any>("photo.jpg", file(context!!).length())) }
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<String>?) = 0
    override fun delete(uri: Uri, selection: String?, args: Array<String>?) = 0

    companion object {
        fun file(c: Context) = File(c.cacheDir, "photo.jpg")
        fun uri(c: Context): Uri = Uri.parse("content://${c.packageName}.photos/photo.jpg")
    }
}
