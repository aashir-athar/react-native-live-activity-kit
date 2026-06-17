//
//  LiveActivityKitLiveActivity.swift
//  react-native-live-activity-kit — generated widget extension
//
//  The default, data-driven Live Activity UI. It renders the shared
//  `LiveActivityKitAttributes.ContentState` across the Lock Screen / banner and
//  every Dynamic Island presentation (compact, minimal, expanded).
//
//  This file is YOURS to customize — edit the SwiftUI below to match your brand.
//  It only reads fields from `ContentState`; to add new typed fields, extend
//  `LiveActivityKitAttributes.swift` (kept in sync with the JS + server schema).
//

import ActivityKit
import SwiftUI
import WidgetKit

@available(iOS 16.1, *)
struct LiveActivityKitLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityKitAttributes.self) { context in
      // ── Lock Screen / banner ──
      LiveActivityKitLockScreenView(state: context.state)
        .activityBackgroundTint(Color.black.opacity(0.35))
        .activitySystemActionForegroundColor(.white)

    } dynamicIsland: { context in
      let state = context.state
      let tint = LiveActivityKitTheme.color(state.tintColorHex)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(spacing: 6) {
            if let symbol = state.imageName {
              Image(systemName: symbol).foregroundStyle(tint ?? .primary)
            }
            if let leading = state.leading {
              Text(leading).font(.headline)
            }
          }
        }
        DynamicIslandExpandedRegion(.trailing) {
          if let trailing = state.trailing ?? state.status {
            Text(trailing).font(.headline).foregroundStyle(tint ?? .primary)
          } else if let date = state.date {
            Text(LiveActivityKitTheme.relativeDate(date), style: .timer)
              .multilineTextAlignment(.trailing)
              .frame(maxWidth: 64)
              .monospacedDigit()
          }
        }
        DynamicIslandExpandedRegion(.center) {
          Text(state.title).font(.headline).lineLimit(1)
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 6) {
            if let subtitle = state.subtitle {
              Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
            }
            if let progress = state.progress {
              ProgressView(value: progress).tint(tint ?? .accentColor)
            }
          }
        }
      } compactLeading: {
        if let symbol = state.imageName {
          Image(systemName: symbol).foregroundStyle(tint ?? .primary)
        } else if let leading = state.leading {
          Text(leading).font(.caption2).lineLimit(1)
        }
      } compactTrailing: {
        if let trailing = state.trailing ?? state.status {
          Text(trailing).font(.caption2).lineLimit(1).foregroundStyle(tint ?? .primary)
        } else if let progress = state.progress {
          ProgressView(value: progress).progressViewStyle(.circular).tint(tint ?? .accentColor)
        } else if let date = state.date {
          Text(LiveActivityKitTheme.relativeDate(date), style: .timer)
            .frame(maxWidth: 44).monospacedDigit().font(.caption2)
        }
      } minimal: {
        if let symbol = state.imageName {
          Image(systemName: symbol).foregroundStyle(tint ?? .primary)
        } else if let progress = state.progress {
          ProgressView(value: progress).progressViewStyle(.circular).tint(tint ?? .accentColor)
        } else {
          Text(String(state.title.prefix(1))).font(.caption)
        }
      }
      .keylineTint(tint)
    }
  }
}

// ── Lock Screen presentation ────────────────────────────────────────────────

@available(iOS 16.1, *)
struct LiveActivityKitLockScreenView: View {
  let state: LiveActivityKitAttributes.ContentState

  var body: some View {
    let tint = LiveActivityKitTheme.color(state.tintColorHex)
    HStack(alignment: .top, spacing: 12) {
      if let symbol = state.imageName {
        Image(systemName: symbol)
          .font(.title2)
          .foregroundStyle(tint ?? .primary)
          .frame(width: 32)
      }
      VStack(alignment: .leading, spacing: 4) {
        Text(state.title).font(.headline).lineLimit(1)
        if let subtitle = state.subtitle {
          Text(subtitle).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
        }
        if let body = state.body {
          Text(body).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
        if let progress = state.progress {
          ProgressView(value: progress).tint(tint ?? .accentColor)
        }
      }
      Spacer(minLength: 8)
      VStack(alignment: .trailing, spacing: 4) {
        if let status = state.status {
          Text(status)
            .font(.caption).bold()
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background((tint ?? .accentColor).opacity(0.2), in: Capsule())
            .foregroundStyle(tint ?? .primary)
        }
        if let date = state.date {
          Text(LiveActivityKitTheme.relativeDate(date), style: .timer)
            .font(.title3).monospacedDigit()
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 80)
        }
        if let trailing = state.trailing {
          Text(trailing).font(.caption).foregroundStyle(.secondary)
        }
      }
    }
    .padding()
  }
}

// ── Shared theming helpers ──────────────────────────────────────────────────

enum LiveActivityKitTheme {
  /// Parse "#RRGGBB" / "#AARRGGBB" (with or without leading '#') into a Color.
  static func color(_ hex: String?) -> Color? {
    guard var raw = hex?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
      return nil
    }
    if raw.hasPrefix("#") { raw.removeFirst() }
    guard let value = UInt64(raw, radix: 16) else { return nil }
    let r, g, b, a: Double
    switch raw.count {
    case 6:
      r = Double((value & 0xFF0000) >> 16) / 255
      g = Double((value & 0x00FF00) >> 8) / 255
      b = Double(value & 0x0000FF) / 255
      a = 1
    case 8:
      a = Double((value & 0xFF00_0000) >> 24) / 255
      r = Double((value & 0x00FF_0000) >> 16) / 255
      g = Double((value & 0x0000_FF00) >> 8) / 255
      b = Double(value & 0x0000_00FF) / 255
    default:
      return nil
    }
    return Color(.sRGB, red: r, green: g, blue: b, opacity: a)
  }

  /// Convert epoch milliseconds to a `Date` for `Text(_:style: .timer)`.
  static func relativeDate(_ epochMs: Double) -> Date {
    Date(timeIntervalSince1970: epochMs / 1000)
  }
}
