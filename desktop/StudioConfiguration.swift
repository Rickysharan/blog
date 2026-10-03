import Foundation

enum StudioConfigurationError: Error, CustomStringConvertible {
    case missing(String)
    case unsafeURL

    var description: String {
        switch self {
        case let .missing(key): return "Missing \(key) in OmniLede.app. Reinstall the app."
        case .unsafeURL: return "OmniLede Studio must use a public HTTPS origin without credentials."
        }
    }
}

struct StudioConfiguration {
    let studioURL: URL
    let origin: URL
    let projectPath: String

    init(studioURL rawURL: String, projectPath: String) throws {
        guard
            let components = URLComponents(string: rawURL),
            components.scheme?.lowercased() == "https",
            components.user == nil,
            components.password == nil,
            let host = components.host?.lowercased(),
            !host.isEmpty,
            components.port == nil || components.port == 443,
            !Self.isUnsafeHost(host),
            let url = components.url
        else { throw StudioConfigurationError.unsafeURL }

        var originComponents = URLComponents()
        originComponents.scheme = "https"
        originComponents.host = host
        guard let origin = originComponents.url else { throw StudioConfigurationError.unsafeURL }
        self.studioURL = url
        self.origin = origin
        self.projectPath = projectPath
    }

    init(bundle: Bundle = .main) throws {
        guard let studioURL = bundle.object(forInfoDictionaryKey: "OmniLedeStudioURL") as? String else {
            throw StudioConfigurationError.missing("OmniLedeStudioURL")
        }
        guard let projectPath = bundle.object(forInfoDictionaryKey: "OmniLedeProjectPath") as? String else {
            throw StudioConfigurationError.missing("OmniLedeProjectPath")
        }
        try self.init(studioURL: studioURL, projectPath: projectPath)
    }

    func allows(url: URL) -> Bool {
        guard url.user == nil, url.password == nil else { return false }
        return url.scheme?.lowercased() == "https"
            && url.host?.lowercased() == origin.host?.lowercased()
            && (url.port ?? 443) == 443
    }

    func allowsRedirect(from: URL, to: URL) -> Bool {
        allows(url: from) && allows(url: to)
    }

    private static func isUnsafeHost(_ host: String) -> Bool {
        if !host.contains(".") || host.hasSuffix(".")
            || host == "localhost" || host.hasSuffix(".localhost") || host.hasSuffix(".local")
            || host.hasSuffix(".internal") || host.hasSuffix(".test") || host.hasSuffix(".invalid")
            || host.hasSuffix(".example") || host.hasSuffix(".home.arpa") || host.hasSuffix(".onion") { return true }
        if host.contains(":") { return true }
        let octets = host.split(separator: ".").compactMap { Int($0) }
        if octets.count == 4, octets.allSatisfy({ (0...255).contains($0) }) {
            let first = octets[0], second = octets[1]
            return first == 0 || first == 10 || first == 127 || first >= 224
                || (first == 169 && second == 254)
                || (first == 172 && (16...31).contains(second))
                || (first == 192 && second == 168)
                || (first == 100 && (64...127).contains(second))
                || (first == 192 && second == 0)
                || (first == 198 && (18...19).contains(second))
                || (first == 198 && second == 51)
                || (first == 203 && second == 0)
        }
        if host.unicodeScalars.allSatisfy(CharacterSet.decimalDigits.contains) { return true }
        return false
    }
}

final class StudioNavigationPolicy {
    private let configuration: StudioConfiguration
    private let reject: (String) -> Void

    init(configuration: StudioConfiguration, reject: @escaping (String) -> Void) {
        self.configuration = configuration
        self.reject = reject
    }

    func allows(url: URL, isMainFrame: Bool, redirectFrom: URL? = nil) -> Bool {
        guard isMainFrame else { reject("rejected-navigation-frame"); return false }
        if let redirectFrom, !configuration.allowsRedirect(from: redirectFrom, to: url) {
            reject("rejected-navigation-redirect")
            return false
        }
        guard configuration.allows(url: url) else {
            reject("rejected-navigation-origin")
            return false
        }
        return true
    }
}
