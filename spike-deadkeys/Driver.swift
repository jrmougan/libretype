// Spike automatizado: postea eventos de teclado sinteticos a un WKWebView propio
// y compara lo que reporta el DOM contra el motor de texto de macOS (UCKeyTranslate).
import Cocoa
import WebKit
import Carbon.HIToolbox

// --- Virtual keycodes (posicion fisica; el layout ES-ISO los reinterpreta) ---
let VK_A: UInt16 = 0, VK_T: UInt16 = 17, VK_U: UInt16 = 32, VK_E: UInt16 = 14
let VK_2: UInt16 = 19, VK_SPACE: UInt16 = 49
let VK_QUOTE: UInt16 = 39      // en ES-ISO: ´ (acute muerta), Shift -> ¨ (dieresis)
let VK_SEMI: UInt16 = 41       // en ES-ISO: ñ

struct Step { let code: UInt16; let flags: CGEventFlags }
func k(_ c: UInt16, _ f: CGEventFlags = []) -> Step { Step(code: c, flags: f) }

struct Test { let id: String; let desc: String; let steps: [Step] }

let TESTS: [Test] = [
  Test(id:"T1", desc:"´ + a  -> tilde normal",        steps:[k(VK_QUOTE), k(VK_A)]),
  Test(id:"T2", desc:"´ + t  -> DEAD KEY CANCELADA",  steps:[k(VK_QUOTE), k(VK_T)]),
  Test(id:"T3", desc:"´ + espacio",                   steps:[k(VK_QUOTE), k(VK_SPACE)]),
  Test(id:"T4", desc:"´ + ´  -> acento doble",        steps:[k(VK_QUOTE), k(VK_QUOTE)]),
  Test(id:"T5", desc:"ñ directa",                     steps:[k(VK_SEMI)]),
  Test(id:"T6", desc:"Shift+´ + u -> dieresis",       steps:[k(VK_QUOTE, .maskShift), k(VK_U)]),
  Test(id:"T7", desc:"Option+2 (arroba en Mac ES)",   steps:[k(VK_2, .maskAlternate)]),
  Test(id:"T8", desc:"Option+e (euro en Mac ES)",     steps:[k(VK_E, .maskAlternate)]),
]

// --- ORACULO: que dice el propio motor de texto de macOS ---
func oracle(_ steps: [Step]) -> String {
    guard let src = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
          let p = TISGetInputSourceProperty(src, kTISPropertyUnicodeKeyLayoutData)
    else { return "<sin layout>" }
    let data = Unmanaged<CFData>.fromOpaque(p).takeUnretainedValue() as Data
    var out = ""
    var dead: UInt32 = 0
    data.withUnsafeBytes { raw in
        guard let layout = raw.baseAddress?.assumingMemoryBound(to: UCKeyboardLayout.self)
        else { return }
        for s in steps {
            var mods: UInt32 = 0
            if s.flags.contains(.maskShift)     { mods |= UInt32(shiftKey >> 8) }
            if s.flags.contains(.maskAlternate) { mods |= UInt32(optionKey >> 8) }
            var chars = [UniChar](repeating: 0, count: 8)
            var len = 0
            UCKeyTranslate(layout, s.code, UInt16(kUCKeyActionDown), mods,
                           UInt32(LMGetKbdType()), 0, &dead, 8, &len, &chars)
            out += String(utf16CodeUnits: chars, count: len)
        }
        // Si queda un dead key pendiente, el SO lo emitira al terminar la
        // secuencia. Lo vaciamos con espacio (que en ES-ISO no anade espacio).
        if dead != 0 {
            var chars = [UniChar](repeating: 0, count: 8)
            var len = 0
            UCKeyTranslate(layout, VK_SPACE, UInt16(kUCKeyActionDown), 0,
                           UInt32(LMGetKbdType()), 0, &dead, 8, &len, &chars)
            out += String(utf16CodeUnits: chars, count: len)
        }
    }
    return out
}

func layoutName() -> String {
    guard let src = TISCopyCurrentKeyboardLayoutInputSource()?.takeRetainedValue(),
          let p = TISGetInputSourceProperty(src, kTISPropertyLocalizedName)
    else { return "?" }
    return Unmanaged<CFString>.fromOpaque(p).takeUnretainedValue() as String
}

final class Driver: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!, web: WKWebView!, native: NSTextView!
    var i = 0
    var phase = 0        // 0 = webview, 1 = NSTextView nativo
    var dom: [String: String] = [:], nat: [String: String] = [:]
    var seqs: [String: String] = [:]

    func applicationDidFinishLaunching(_ n: Notification) {
        web = WKWebView(frame: NSRect(x:0, y:110, width: 700, height: 220))
        web.navigationDelegate = self
        native = NSTextView(frame: NSRect(x:0, y:0, width: 700, height: 110))
        native.font = NSFont.monospacedSystemFont(ofSize: 20, weight: .regular)
        native.isRichText = false
        native.isAutomaticQuoteSubstitutionEnabled = false
        native.isAutomaticTextReplacementEnabled = false
        let container = NSView(frame: NSRect(x:0, y:0, width:700, height:330))
        container.addSubview(web); container.addSubview(native)
        window = NSWindow(contentRect: NSRect(x:0, y:0, width:700, height:330),
                          styleMask:[.titled], backing:.buffered, defer:false)
        window.title = "Spike — WKWebView (arriba) vs NSTextView nativo (abajo)"
        window.contentView = container
        window.center(); window.makeKeyAndOrderFront(nil)
        let dir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        web.loadFileURL(dir.appendingPathComponent("auto.html"), allowingReadAccessTo: dir)
        NSApp.activate(ignoringOtherApps: true)
    }

    func webView(_ w: WKWebView, didFinish nav: WKNavigation!) {
        print("Layout activo: \(layoutName())")
        print("Ejecutando \(TESTS.count) casos...\n")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { self.runTest() }
    }

    func runTest() {
        guard i < TESTS.count else {
            if phase == 0 { phase = 1; i = 0
                print("--- pasada nativa (NSTextView) ---")
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { self.runTest() }
                return
            }
            return report()
        }
        let t = TESTS[i]
        if phase == 0 {
            window.makeFirstResponder(web)
            web.evaluateJavaScript("window.__reset()") { _, _ in
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    self.post(t.steps, 0, t)
                }
            }
        } else {
            native.string = ""
            window.makeFirstResponder(native)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                self.post(t.steps, 0, t)
            }
        }
    }

    // Postea cada tecla con separacion down/up realista (~45ms), como un humano.
    func post(_ steps: [Step], _ n: Int, _ t: Test) {
        guard n < steps.count else {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { self.collect(t) }
            return
        }
        let s = steps[n]
        let mode = ProcessInfo.processInfo.environment["SPIKE_POST"] ?? "nsevent"
        func fire(_ down: Bool) {
            let src = CGEventSource(stateID: .hidSystemState)
            guard let e = CGEvent(keyboardEventSource: src,
                                  virtualKey: s.code, keyDown: down) else { return }
            e.flags = s.flags
            switch mode {
            case "hid": e.post(tap: .cghidEventTap)
            case "pid": e.postToPid(getpid())
            case "session": e.post(tap: .cgSessionEventTap)
            default: if let ns = NSEvent(cgEvent: e) { NSApp.postEvent(ns, atStart: false) }
            }
        }
        fire(true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.045) {
            fire(false)
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.11) {
                self.post(steps, n + 1, t)
            }
        }
    }

    func collect(_ t: Test) {
        if phase == 1 {
            // El texto sin confirmar (marked text) tambien cuenta: es lo que el
            // usuario ve en pantalla, igual que en el textarea del DOM.
            var v = native.string
            if native.hasMarkedText(), let ts = native.textStorage {
                v = ts.string
            }
            nat[t.id] = v
            i += 1
            runTest()
            return
        }
        web.evaluateJavaScript("window.__read()") { res, _ in
            var value = "<nada>", seq = ""
            if let s = res as? String, let d = s.data(using: .utf8),
               let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                value = (o["value"] as? String) ?? ""
                if let log = o["log"] as? [[String: Any]] {
                    seq = log.map { r -> String in
                        let ty = (r["type"] as? String) ?? "?"
                        if ty.hasPrefix("key") { return "\(ty)(\((r["key"] as? String) ?? "-"))" }
                        let dt = (r["data"] as? String).map { "'\($0)'" } ?? "null"
                        return "\(ty)(\(dt))"
                    }.joined(separator: " ")
                }
            }
            self.seqs[t.id] = seq
            self.dom[t.id] = value
            self.i += 1
            self.runTest()
        }
    }

    func report() {
        let line = String(repeating: "=", count: 84)
        print("")
        print(line)
        print("CASO  DESCRIPCION                      NATIVO      WKWebView   UCKeyTr   VEREDICTO")
        print(line)
        var diffs: [String] = []
        for t in TESTS {
            let n = nat[t.id] ?? "", d = dom[t.id] ?? "", o = oracle(t.steps)
            let match = (n == d)
            if !match { diffs.append(t.id) }
            let dd = t.desc.padding(toLength: 32, withPad: " ", startingAt: 0)
            let nn = n.debugDescription.padding(toLength: 11, withPad: " ", startingAt: 0)
            let ww = d.debugDescription.padding(toLength: 11, withPad: " ", startingAt: 0)
            let oo = o.debugDescription.padding(toLength: 9, withPad: " ", startingAt: 0)
            print("\(t.id)    \(dd) \(nn) \(ww) \(oo) \(match ? "coinciden" : "<-- DIVERGE")")
        }
        print(line)
        print("NATIVO = NSTextView de AppKit (la referencia: como se comporta macOS)")
        print("UCKeyTr = UCKeyTranslate, informativo (su manejo del dead state pendiente")
        print("          no modela el texto sin confirmar, por eso puede anadir espacios)")
        for id in ["T1", "T2", "T6"] {
            let d = TESTS.first { $0.id == id }?.desc ?? ""
            print("\n\(id) — \(d)")
            print("  \(seqs[id]?.isEmpty == false ? seqs[id]! : "<sin eventos>")")
        }
        print("\n" + line)
        if diffs.contains("T2") {
            print("BUG REPRODUCE: WKWebView diverge del texto nativo en la dead key")
            print("cancelada -> Tauri descartado, Electron es la eleccion.")
        } else if diffs.isEmpty {
            print("SIN DIVERGENCIA en 8/8 casos: WKWebView se comporta EXACTAMENTE")
            print("igual que un campo de texto nativo de macOS con layout espanol.")
            print("-> El argumento que descartaba a Tauri NO se sostiene.")
        } else {
            print("T2 pasa, pero divergen \(diffs). Revisar esos casos a mano.")
        }
        print(line)
        NSApp.terminate(nil)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let d = Driver()
app.delegate = d
app.run()
