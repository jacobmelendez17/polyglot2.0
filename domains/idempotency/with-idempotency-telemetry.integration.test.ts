import { randomUUID } from "node:crypto";

import { metrics } from "@opentelemetry/api";
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
  type DataPoint,
} from "@opentelemetry/sdk-metrics";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seedTestFixtures } from "@/db/seed/test-fixtures";
import { withTestTransaction } from "@/db/test/with-test-transaction";
import {
  clearActiveSignals,
  setActiveSignals,
} from "@/lib/observability/active";
import { resetInstrumentsForTests } from "@/lib/observability/instruments";

import { withIdempotency } from "./with-idempotency";

/**
 * Spec 27 Unit 27.5 — every idempotent transaction is also a
 * `database_operation_duration_ms` sample (`operation=transaction`), against the
 * real database: `success` when it commits, `failure` when it rolls back. With
 * the metrics signal off, none of it runs.
 */

let exporter: InMemoryMetricExporter;
let meterProvider: MeterProvider;

beforeEach(() => {
  exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
  meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter,
        exportIntervalMillis: 3_600_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);
  resetInstrumentsForTests();
  setActiveSignals({ metrics: true, traces: false, logs: false });
});

afterEach(async () => {
  clearActiveSignals();
  metrics.disable();
  resetInstrumentsForTests();
  await meterProvider.shutdown();
});

async function samples(): Promise<DataPoint<unknown>[]> {
  await meterProvider.forceFlush();
  return exporter
    .getMetrics()
    .flatMap((resource) => resource.scopeMetrics)
    .flatMap((scope) => scope.metrics)
    .filter(
      (metric) => metric.descriptor.name === "database_operation_duration_ms",
    )
    .flatMap((metric) => metric.dataPoints as DataPoint<unknown>[]);
}

const countFor = (points: DataPoint<unknown>[], outcome: string) =>
  points
    .filter(
      (point) =>
        (point.attributes as Record<string, string>).outcome === outcome &&
        (point.attributes as Record<string, string>).operation ===
          "transaction",
    )
    .reduce((sum, point) => sum + (point.value as { count: number }).count, 0);

describe("withIdempotency timing", () => {
  it("records a committed transaction as a successful `transaction` sample", async () => {
    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);

      const result = await withIdempotency(
        tx,
        {
          userId: learnerId,
          operation: "test.timing",
          key: randomUUID(),
          payload: {},
        },
        async () => ({ ok: true }),
      );

      expect(result).toEqual({ ok: true });
    });

    const points = await samples();
    expect(countFor(points, "success")).toBe(1);
    expect(countFor(points, "failure")).toBe(0);
    expect(points[0]!.attributes).toMatchObject({
      environment: expect.any(String),
    });
  });

  it("records a transaction that rolls back as a `failure` sample, and still rethrows", async () => {
    const refusal = new Error("refused inside the transaction");

    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);

      await expect(
        withIdempotency(
          tx,
          {
            userId: learnerId,
            operation: "test.timing",
            key: randomUUID(),
            payload: {},
          },
          async () => {
            throw refusal;
          },
        ),
      ).rejects.toBe(refusal);
    });

    const points = await samples();
    expect(countFor(points, "failure")).toBe(1);
    expect(countFor(points, "success")).toBe(0);
  });

  it("records nothing while the metrics signal is off", async () => {
    clearActiveSignals();

    await withTestTransaction(async (tx) => {
      const { learnerId } = await seedTestFixtures(tx);
      await withIdempotency(
        tx,
        {
          userId: learnerId,
          operation: "test.timing",
          key: randomUUID(),
          payload: {},
        },
        async () => ({ ok: true }),
      );
    });

    expect(await samples()).toEqual([]);
  });
});
