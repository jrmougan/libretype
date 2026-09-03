// Host mínimo de WKWebView para el spike de dead keys.
// Aísla el motor: mismo logger.html que en Chrome, distinto engine debajo.
import Cocoa
import WebKit

final class Bridge: NSObject, WKScriptMessageHandler {
    func userContentController(_ ucc: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        let dir = FileManager.default.currentDirectoryPath
        let path = "\(dir)/resultado-wkwebview.json"
        try? String(describing: message.body).write(toFile: path,
                                                    atomically: true, encoding: .utf8)
        print("\n[spike] JSON escrito en \(path)")
        fflush(stdout)
    }
}

final class Delegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    let bridge = Bridge()

    func applicationDidFinishLaunching(_ note: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(bridge, name: "spike")
        // Marca para que la página sepa que corre bajo WKWebView y no bajo Safari.
        cfg.userContentController.addUserScript(WKUserScript(
            source: "window.__WKWEBVIEW_HOST__ = true;",
            injectionTime: .atDocumentStart, forMainFrameOnly: true))

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1180, height: 800),
                            configuration: cfg)

        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1180, height: 800),
                          styleMask: [.titled, .closable, .miniaturizable, .resizable],
                          backing: .buffered, defer: false)
        window.title = "Spike dead keys — WKWebView"
        window.contentView = webView
        window.center()
        window.makeKeyAndOrderFront(nil)

        let dir = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let page = dir.appendingPathComponent("logger.html")
        webView.loadFileURL(page, allowingReadAccessTo: dir)

        NSApp.activate(ignoringOtherApps: true)
        print("[spike] WKWebView arrancado. Teclea en la ventana.")
        print("[spike] Al terminar pulsa 'Copiar JSON' y luego cierra la ventana.")
        fflush(stdout)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ a: NSApplication) -> Bool { true }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = Delegate()
app.delegate = delegate
app.run()
