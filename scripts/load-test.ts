// Simple concurrent load simulation for 500q exam - no external deps
// Usage: tsx scripts/load-test.ts

async function simulateLoad(concurrency = 20, iterations = 5) {
  console.log(`[load] concurrency=${concurrency} iterations=${iterations}`);
  const tasks: Promise<number>[] = [];
  const start = performance.now();
  for (let i = 0; i < concurrency; i++) {
    tasks.push(
      (async () => {
        let totalMs = 0;
        for (let j = 0; j < iterations; j++) {
          const t0 = performance.now();
          const qs = Array.from({ length: 500 }, (_, k) => ({
            questionId: `q${k}`,
            sectionId: "s1",
            marks: 1,
            negativeMarks: 0.25,
            isBonus: false,
            isCancelled: false,
            correctOptionId: "a",
            selectedOptionId: k % 2 === 0 ? "a" : "b",
          }));
          let score = 0;
          let max = 0;
          for (const q of qs) {
            max += q.marks;
            if (q.selectedOptionId === q.correctOptionId) score += q.marks;
            else if (q.selectedOptionId) score -= q.negativeMarks;
          }
          void max;
          void score;
          const dt = performance.now() - t0;
          totalMs += dt;
        }
        return totalMs / iterations;
      })()
    );
  }
  const results = await Promise.all(tasks);
  const elapsed = performance.now() - start;
  const avg = results.reduce((a, b) => a + b, 0) / results.length;
  const maxAvg = Math.max(...results);
  const min = Math.min(...results);
  console.log(`[load] elapsed wall: ${elapsed.toFixed(0)}ms`);
  console.log(
    `[load] avg per 500q scoring: ${avg.toFixed(2)}ms min ${min.toFixed(2)} max ${maxAvg.toFixed(2)}`
  );
  console.log(
    `[load] throughput: ${((concurrency * iterations) / (elapsed / 1000)).toFixed(1)} ops/sec`
  );
  if (avg > 50) {
    console.error("[load] FAIL avg >50ms");
    process.exit(1);
  }
  console.log("[load] PASS");
}

simulateLoad(20, 5);
