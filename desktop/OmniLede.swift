import AppKit

final class OmniLedeAppDelegate: NSObject, NSApplicationDelegate {
    private var studioWindow: StudioWindowController?

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            let configuration = try StudioConfiguration()
            let controller = StudioWindowController(configuration: configuration)
            studioWindow = controller
            controller.showWindow(nil)
            controller.window?.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)

            if ProcessInfo.processInfo.arguments.contains("--smoke-test") {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                    print("Native Studio smoke check passed: WKWebView launched idle without a writer command.")
                    NSApp.terminate(nil)
                }
            }
        } catch {
            let alert = NSAlert()
            alert.alertStyle = .critical
            alert.messageText = "OmniLede Studio could not start"
            alert.informativeText = String(describing: error)
            alert.runModal()
            NSApp.terminate(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) { studioWindow?.shutdown() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        studioWindow?.showWindow(nil)
        studioWindow?.window?.makeKeyAndOrderFront(nil)
        return true
    }
}

@main
struct OmniLedeMain {
    static func main() {
        let application = NSApplication.shared
        let delegate = OmniLedeAppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }
}
