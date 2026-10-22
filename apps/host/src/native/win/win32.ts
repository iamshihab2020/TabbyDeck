import { loadKoffi } from './koffi.ts';

/** All Win32 declarations TabbyDeck uses, created once on first use. */
function declare() {
  const koffi = loadKoffi();
  const user32 = koffi.load('user32.dll');
  const kernel32 = koffi.load('kernel32.dll');
  const crypt32 = koffi.load('crypt32.dll');
  const dwmapi = koffi.load('dwmapi.dll');
  const ntdll = koffi.load('ntdll.dll');

  const KEYBDINPUT = koffi.struct('TB_KEYBDINPUT', { wVk: 'uint16', wScan: 'uint16', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr' });
  const MOUSEINPUT = koffi.struct('TB_MOUSEINPUT', { dx: 'int32', dy: 'int32', mouseData: 'uint32', dwFlags: 'uint32', time: 'uint32', dwExtraInfo: 'uintptr' });
  const HARDWAREINPUT = koffi.struct('TB_HARDWAREINPUT', { uMsg: 'uint32', wParamL: 'uint16', wParamH: 'uint16' });
  const INPUT = koffi.struct('TB_INPUT', { type: 'uint32', u: koffi.union('TB_INPUT_U', { mi: MOUSEINPUT, ki: KEYBDINPUT, hi: HARDWAREINPUT }) });
  const BLOB = koffi.struct('TB_DATA_BLOB', { cbData: 'uint32', pbData: 'void *' });
  const EnumProc = koffi.proto('__stdcall', 'TB_WNDENUMPROC', 'bool', ['void *', 'intptr']);
  const RECT = koffi.struct('TB_RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  const MONITORINFO = koffi.struct('TB_MONITORINFO', { cbSize: 'uint32', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32' });
  const POWER_STATUS = koffi.struct('TB_SYSTEM_POWER_STATUS', { ACLineStatus: 'uint8', BatteryFlag: 'uint8', BatteryLifePercent: 'uint8', SystemStatusFlag: 'uint8', BatteryLifeTime: 'uint32', BatteryFullLifeTime: 'uint32' });
  const MonitorProc = koffi.proto('__stdcall', 'TB_MONITORENUMPROC', 'bool', ['void *', 'void *', 'void *', 'intptr']);

  return {
    koffi, INPUT, BLOB, EnumProc, MonitorProc,
    inputSize: koffi.sizeof(INPUT),
    SendInput: user32.func('__stdcall', 'SendInput', 'uint32', ['uint32', koffi.pointer(INPUT), 'int32']),
    MapVirtualKeyW: user32.func('__stdcall', 'MapVirtualKeyW', 'uint32', ['uint32', 'uint32']),
    GetSystemMetrics: user32.func('__stdcall', 'GetSystemMetrics', 'int32', ['int32']),
    EnumWindows: user32.func('__stdcall', 'EnumWindows', 'bool', [koffi.pointer(EnumProc), 'intptr']),
    GetWindowTextW: user32.func('__stdcall', 'GetWindowTextW', 'int32', ['void *', koffi.out(koffi.pointer('uint16')), 'int32']),
    GetWindowTextLengthW: user32.func('__stdcall', 'GetWindowTextLengthW', 'int32', ['void *']),
    IsWindowVisible: user32.func('__stdcall', 'IsWindowVisible', 'bool', ['void *']),
    IsIconic: user32.func('__stdcall', 'IsIconic', 'bool', ['void *']),
    ShowWindow: user32.func('__stdcall', 'ShowWindow', 'bool', ['void *', 'int32']),
    SetForegroundWindow: user32.func('__stdcall', 'SetForegroundWindow', 'bool', ['void *']),
    GetForegroundWindow: user32.func('__stdcall', 'GetForegroundWindow', 'void *', []),
    GetWindowThreadProcessId: user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['void *', koffi.out(koffi.pointer('uint32'))]),
    GetWindow: user32.func('__stdcall', 'GetWindow', 'void *', ['void *', 'uint32']),
    GetWindowLongPtrW: user32.func('__stdcall', 'GetWindowLongPtrW', 'intptr', ['void *', 'int32']),
    IsZoomed: user32.func('__stdcall', 'IsZoomed', 'bool', ['void *']),
    GetWindowRect: user32.func('__stdcall', 'GetWindowRect', 'bool', ['void *', koffi.out(koffi.pointer(RECT))]),
    SetWindowPos: user32.func('__stdcall', 'SetWindowPos', 'bool', ['void *', 'void *', 'int32', 'int32', 'int32', 'int32', 'uint32']),
    MonitorFromWindow: user32.func('__stdcall', 'MonitorFromWindow', 'void *', ['void *', 'uint32']),
    GetMonitorInfoW: user32.func('__stdcall', 'GetMonitorInfoW', 'bool', ['void *', koffi.inout(koffi.pointer(MONITORINFO))]),
    EnumDisplayMonitors: user32.func('__stdcall', 'EnumDisplayMonitors', 'bool', ['void *', 'void *', koffi.pointer(MonitorProc), 'intptr']),
    DwmFrameBounds: dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32', ['void *', 'uint32', koffi.out(koffi.pointer(RECT)), 'uint32']),
    DwmCloaked: dwmapi.func('__stdcall', 'DwmGetWindowAttribute', 'int32', ['void *', 'uint32', koffi.out(koffi.pointer('uint32')), 'uint32']),
    SetThreadDpiAwarenessContext: user32.func('__stdcall', 'SetThreadDpiAwarenessContext', 'intptr', ['intptr']),
    OpenProcess: kernel32.func('__stdcall', 'OpenProcess', 'void *', ['uint32', 'bool', 'uint32']),
    QueryFullProcessImageNameW: kernel32.func('__stdcall', 'QueryFullProcessImageNameW', 'bool', ['void *', 'uint32', koffi.out(koffi.pointer('uint16')), koffi.inout(koffi.pointer('uint32'))]),
    CloseHandle: kernel32.func('__stdcall', 'CloseHandle', 'bool', ['void *']),
    keybd_event: user32.func('__stdcall', 'keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr']),
    CryptProtectData: crypt32.func('__stdcall', 'CryptProtectData', 'bool', [koffi.pointer(BLOB), 'str16', 'void *', 'void *', 'void *', 'uint32', koffi.out(koffi.pointer(BLOB))]),
    CryptUnprotectData: crypt32.func('__stdcall', 'CryptUnprotectData', 'bool', [koffi.pointer(BLOB), 'void *', 'void *', 'void *', 'void *', 'uint32', koffi.out(koffi.pointer(BLOB))]),
    GetSystemPowerStatus: kernel32.func('__stdcall', 'GetSystemPowerStatus', 'bool', [koffi.out(koffi.pointer(POWER_STATUS))]),
    NtQueryWnfStateData: ntdll.func('__stdcall', 'NtQueryWnfStateData', 'int32', [koffi.pointer('uint64'), 'void *', 'void *', koffi.out(koffi.pointer('uint32')), koffi.out(koffi.pointer('uint32')), koffi.inout(koffi.pointer('uint32'))]),
    LocalFree: kernel32.func('__stdcall', 'LocalFree', 'void *', ['void *']),
  };
}

let w: ReturnType<typeof declare> | null = null;
export const win32 = () => (w ??= declare());
