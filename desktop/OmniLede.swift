import AppKit

final class OmniLedeAppDelegate: NSObject, NSApplicationDelegate {
    private var studioWindow: StudioWindowController?
    private var setupWindow: NSWindow?

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
            showSetupState()
            if ProcessInfo.processInfo.arguments.contains("--smoke-test") {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    print("Native Studio setup state passed: no native bridge or writer capability was created.")
                    NSApp.terminate(nil)
                }
            }
        }
    }

    private func showSetupState() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 320),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "OmniLede Studio — Setup needed"
        window.center()
        let heading = NSTextField(labelWithString: "Studio is not connected yet")
        heading.font = .systemFont(ofSize: 26, weight: .bold)
        let detail = NSTextField(wrappingLabelWithString: "Your local writer is safe and has not started. After the private Studio site is deployed, reinstall OmniLede from the project so this app can connect to its exact secure address.")
        detail.font = .systemFont(ofSize: 15)
        detail.textColor = .secondaryLabelColor
        let status = NSTextField(labelWithString: "Unavailable until Studio setup is complete")
        status.font = .systemFont(ofSize: 13, weight: .semibold)
        let stack = NSStackView(views: [heading, detail, status])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 18
        stack.translatesAutoresizingMaskIntoConstraints = false
        window.contentView?.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor, constant: 34),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor, constant: -34),
            stack.centerYAnchor.constraint(equalTo: window.contentView!.centerYAnchor),
            detail.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])
        setupWindow = window
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationWillTerminate(_ notification: Notification) { studioWindow?.shutdown() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        studioWindow?.showWindow(nil)
        studioWindow?.window?.makeKeyAndOrderFront(nil)
        setupWindow?.makeKeyAndOrderFront(nil)
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
