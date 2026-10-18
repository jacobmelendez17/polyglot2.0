import { logs, type AnyValueMap } from "@opentelemetry/api-logs";

import { getActiveSignals } from "@/lib/observability/active";
import { METER_NAME } from "@/lib/observability/instruments";
import {
  projectLogRecord,
  type LogLevelName,
} from "@/lib/observability/log-projection";

/**
 * Spec 27 Unit 27.6 — hands a Spec 24 log line to OpenTelemetry's log API,
 * after it has been reduced to the allowlisted projection (see
 * `lib/observability/log-projection.ts`). The local console line is untouched;
 * this is a second, much smaller record of it.
 *
 * With no log exporter running — the default, and every test — this returns on
 * its first line. While one is, it adds one validated record per warning or
 * worse; the record picks up the trace and span id of whatever span is active,
 * which is how a failure's log line and its trace are found together.
 *
 * It must never throw into the code that logged, and it must never log itself
 * (an export failure that logged an export failure would feed on its own
 * output), hence the re-entrancy guard and the empty catch.
 */

let exporting = false;

export function exportLogRecord(
  level: LogLevelName,
  payload: Record<string, unknown>,
): void {
  if (exporting || !getActiveSignals().logs) return;
  exporting = true;
  try {
    const record = projectLogRecord(level, payload);
    if (!record) return;
    logs.getLogger(METER_NAME).emit({
      severityNumber: record.severityNumber,
      severityText: record.severityText,
      body: record.body,
      attributes: record.attributes as AnyValueMap,
    });
  } catch {
    // See above.
  } finally {
    exporting = false;
  }
}
