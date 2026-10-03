import Foundation

enum DailyTaskStatus: String, Codable {
    case todo
    case writing
    case draftReady = "draft-ready"
    case published
    case needsAttention = "needs-attention"

    var label: String {
        switch self {
        case .todo: return "To do"
        case .writing: return "Writing"
        case .draftReady: return "Draft ready"
        case .published: return "Published"
        case .needsAttention: return "Needs attention"
        }
    }

    var isActionable: Bool {
        self == .todo || self == .writing || self == .needsAttention
    }

    var isRetry: Bool {
        self == .writing || self == .needsAttention
    }
}

struct DailyDraftRef: Codable {
    let category: String
    let filename: String
}

struct DailyPlanTask: Codable {
    let category: String
    let label: String
    let reason: String
    let status: DailyTaskStatus
    let draftRef: DailyDraftRef?
}

struct DailyPlanSnapshot: Codable {
    let date: String
    let completedCount: Int
    let totalTasks: Int
    let draftCount: Int
    let publishedCount: Int
    let tasks: [DailyPlanTask]
}

struct DailyPlanError: Decodable {
    let message: String
}
