"use client";

import * as React from "react";
import { ExamHeader } from "./exam-header";
import { SectionTabs } from "./section-tabs";
import { QuestionViewer } from "./question-viewer";
import { QuestionPalette } from "./question-palette";
import { ExamControls } from "./exam-controls";
import { InstructionsScreen } from "./instructions-screen";
import { nextQuestionState } from "@/lib/exam-engine/states";
import { useTimer } from "@/hooks/use-timer";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeScore } from "@/lib/exam-engine/scoring";
import type { QuestionState } from "@/lib/exam-engine/types";

interface ExamOption {
  id: string;
  label: string;
  text: string;
  order: number;
  isCorrect: boolean;
}
interface ExamQuestion {
  id: string;
  text: string;
  order: number;
  marks: number;
  negativeMarks: number;
  isBonus: boolean;
  isCancelled: boolean;
  options: ExamOption[];
  correctOptionId: string | null;
  sectionId: string;
}
interface ExamSection {
  id: string;
  name: string;
  order: number;
  questions: ExamQuestion[];
}
interface ExamData {
  examId: string;
  versionId: string;
  slug: string;
  title: string;
  config: {
    timing: { totalSec: number; warningSec?: number };
    marking?: {
      default: { marks: number; negative: number };
      perSection?: Record<string, { marks: number; negative: number }>;
    };
  };
  instructions?: string;
  sections: ExamSection[];
}
interface Props {
  exam: ExamData;
}

const LS_ATTEMPT_KEY = (examId: string, versionId: string) =>
  `ph:attempt:${examId}:${versionId}`;
const LS_ANSWERS_KEY = (attemptId: string) => `ph:answers:${attemptId}`;
const LS_STATES_KEY = (attemptId: string) => `ph:states:${attemptId}`;

export function ExamSimulator({ exam }: Props) {
  const router = useRouter();
  const storageSlugKeyKey = `${exam.examId}:${exam.versionId}`;
  const [started, setStarted] = React.useState(false);
  const [attemptId, setAttemptId] = React.useState<string | null>(null);
  const [expiresAt, setExpiresAt] = React.useState<Date | null>(null);
  const [activeSectionId, setActiveSectionId] = React.useState(
    exam.sections[0]?.id ?? ""
  );
  const activeSection = React.useMemo(
    () =>
      exam.sections.find((s) => s.id === activeSectionId) ?? exam.sections[0],
    [exam.sections, activeSectionId]
  );
  const [activeQuestionId, setActiveQuestionId] = React.useState<string | null>(
    activeSection?.questions[0]?.id ?? null
  );
  const [answers, setAnswers] = React.useState<Record<string, string | null>>(
    {}
  );
  const [states, setStates] = React.useState<Record<string, QuestionState>>(
    () => {
      const init: Record<string, QuestionState> = {};
      for (const sec of exam.sections)
        for (const q of sec.questions) init[q.id] = "NOT_VISITED";
      if (activeSection?.questions[0])
        init[activeSection.questions[0].id] = "NOT_ANSWERED";
      return init;
    }
  );
  const [submitted, setSubmitted] = React.useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = React.useState(false);
  const [isCreating, setIsCreating] = React.useState(false);
  const [isRecovering, setIsRecovering] = React.useState(true);

  const totalSec = exam.config.timing.totalSec;
  // warningSec available via exam.config.timing.warningSec
  const { remaining, formatted } = useTimer(
    started ? totalSec : totalSec,
    () => {
      if (attemptId && !submitted) {
        handleSubmit(true);
      } else {
        setShowSubmitConfirm(true);
      }
    },
    { expiresAt: started ? expiresAt : null }
  );

  const allQuestions = React.useMemo(
    () => exam.sections.flatMap((s) => s.questions),
    [exam.sections]
  );
  const globalIndexMap = React.useMemo(() => {
    const map = new Map<string, number>();
    allQuestions.forEach((q, idx) => map.set(q.id, idx + 1));
    return map;
  }, [allQuestions]);
  const activeQuestion = React.useMemo(() => {
    for (const sec of exam.sections) {
      const found = sec.questions.find((q) => q.id === activeQuestionId);
      if (found) return found;
    }
    return activeSection?.questions[0] ?? null;
  }, [exam.sections, activeQuestionId, activeSection]);
  const activeGlobalNumber = activeQuestion
    ? (globalIndexMap.get(activeQuestion.id) ?? 1)
    : 1;

  // Recovery on mount
  React.useEffect(() => {
    const storedAttemptId =
      typeof window !== "undefined"
        ? localStorage.getItem(LS_ATTEMPT_KEY(exam.examId, exam.versionId))
        : null;
    if (!storedAttemptId) {
      setIsRecovering(false);
      return;
    }
    // Try to fetch snapshot
    fetch(`/api/attempts/${storedAttemptId}`)
      .then((res) => {
        if (!res.ok) throw new Error("no snapshot");
        return res.json();
      })
      .then((data) => {
        const attempt = data.attempt;
        if (!attempt || attempt.status !== "IN_PROGRESS")
          throw new Error("not in progress");
        // Check expiry
        const exp = new Date(attempt.expiresAt);
        if (exp.getTime() <= Date.now()) throw new Error("expired");
        setAttemptId(attempt.id);
        setExpiresAt(exp);
        // Restore answers/states from server
        const serverAnswers: Record<string, string | null> = {};
        const serverStates: Record<string, QuestionState> = {};
        for (const a of attempt.answers as Array<{
          questionId: string;
          selectedOptionId: string | null;
          state: QuestionState;
        }>) {
          serverAnswers[a.questionId] = a.selectedOptionId;
          serverStates[a.questionId] = a.state;
        }
        // Merge with local (local newer if exists) — for now server wins except we keep local if server missing
        const localAnswersRaw = localStorage.getItem(
          LS_ANSWERS_KEY(attempt.id)
        );
        const localStatesRaw = localStorage.getItem(LS_STATES_KEY(attempt.id));
        let mergedAnswers = serverAnswers;
        let mergedStates = serverStates;
        if (localAnswersRaw && localStatesRaw) {
          try {
            const localAns = JSON.parse(localAnswersRaw);
            const localSt = JSON.parse(localStatesRaw);
            // If local has more recent answers (simple merge: local overwrites server where local has answer)
            mergedAnswers = { ...serverAnswers, ...localAns };
            mergedStates = { ...serverStates, ...localSt };
          } catch {}
        }
        setAnswers(mergedAnswers);
        setStates(mergedStates);
        // Find first non-visited or first question
        setStarted(true);
        // Determine active question: use last active from local or first unanswered
        const lastActive = localStorage.getItem(`ph:active:${attempt.id}`);
        if (lastActive && mergedStates[lastActive]) {
          setActiveQuestionId(lastActive);
          const sec = exam.sections.find((s) =>
            s.questions.some((q) => q.id === lastActive)
          );
          if (sec) setActiveSectionId(sec.id);
        }
      })
      .catch(() => {
        // No valid recovery, clear
        localStorage.removeItem(LS_ATTEMPT_KEY(exam.examId, exam.versionId));
      })
      .finally(() => setIsRecovering(false));
  }, [storageSlugKeyKey, exam.examId, exam.versionId, exam.sections]);

  // Persist active question
  React.useEffect(() => {
    if (attemptId && activeQuestionId) {
      localStorage.setItem(`ph:active:${attemptId}`, activeQuestionId);
    }
  }, [attemptId, activeQuestionId]);

  // Visit tracking
  React.useEffect(() => {
    if (!activeQuestionId) return;
    setStates((prev) => {
      if (prev[activeQuestionId] === "NOT_VISITED") {
        const hasAnswer = !!answers[activeQuestionId];
        return {
          ...prev,
          [activeQuestionId]: hasAnswer ? "ANSWERED" : "NOT_ANSWERED",
        };
      }
      return prev;
    });
  }, [activeQuestionId, answers]);

  // Local persistence
  React.useEffect(() => {
    if (!attemptId) return;
    localStorage.setItem(LS_ANSWERS_KEY(attemptId), JSON.stringify(answers));
    localStorage.setItem(LS_STATES_KEY(attemptId), JSON.stringify(states));
  }, [attemptId, answers, states]);

  // Server sync function
  const syncToServer = React.useCallback(async () => {
    if (!attemptId || submitted) return;
    const payload = {
      answers: Object.entries(states).map(([questionId, state]) => ({
        questionId,
        selectedOptionId: answers[questionId] ?? null,
        state,
        timeSpentMs: 0,
      })),
    };
    try {
      await fetch(`/api/attempts/${attemptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {}
  }, [attemptId, answers, states, submitted]);

  // Periodic sync every 15s + on change debounce
  React.useEffect(() => {
    if (!attemptId || !started || submitted) return;
    const interval = setInterval(syncToServer, 15000);
    return () => clearInterval(interval);
  }, [attemptId, started, submitted, syncToServer]);

  // Sync on change (debounced 1s)
  React.useEffect(() => {
    if (!attemptId || !started || submitted) return;
    const t = setTimeout(syncToServer, 1000);
    return () => clearTimeout(t);
  }, [answers, states, attemptId, started, submitted, syncToServer]);

  // Visibility + beforeunload
  React.useEffect(() => {
    if (!attemptId) return;
    const handler = () => {
      if (document.visibilityState === "hidden") syncToServer();
    };
    const beforeUnload = () => {
      // Use sendBeacon if available for better reliability, fallback to sync
      try {
        const payload = JSON.stringify({
          answers: Object.entries(states).map(([questionId, state]) => ({
            questionId,
            selectedOptionId: answers[questionId] ?? null,
            state,
          })),
        });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon(`/api/attempts/${attemptId}`, blob);
        }
      } catch {}
    };
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, [attemptId, answers, states, syncToServer]);

  // BroadcastChannel for duplicate tab detection
  React.useEffect(() => {
    if (!attemptId) return;
    const channel = new BroadcastChannel(`ph:attempt:${attemptId}`);
    channel.postMessage({ type: "open", attemptId, ts: Date.now() });
    channel.onmessage = (e) => {
      if (e.data.type === "open" && e.data.attemptId === attemptId) {
        // Another tab opened same attempt — could warn, for now just log
        console.warn("Attempt opened in another tab", e.data);
      }
    };
    return () => channel.close();
  }, [attemptId]);

  const createAttempt = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          examId: exam.examId,
          versionId: exam.versionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create attempt");
      const attempt = data.attempt;
      setAttemptId(attempt.id);
      setExpiresAt(new Date(attempt.expiresAt));
      localStorage.setItem(
        LS_ATTEMPT_KEY(exam.examId, exam.versionId),
        attempt.id
      );
      // Initialize states from server (already NOT_VISITED, first visited)
      // Keep current states but ensure first question marked visited
      setStates((prev) => {
        const first = exam.sections[0]?.questions[0]?.id;
        if (first && prev[first] === "NOT_VISITED")
          return { ...prev, [first]: "NOT_ANSWERED" };
        return prev;
      });
      setStarted(true);
    } catch (e) {
      console.error(e);
      alert("Failed to start exam. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const selectOption = (optionId: string) => {
    if (!activeQuestionId) return;
    setAnswers((prev) => ({ ...prev, [activeQuestionId]: optionId }));
    setStates((prev) => {
      const cur = prev[activeQuestionId] ?? "NOT_VISITED";
      const next = nextQuestionState(cur, "answer", true);
      return { ...prev, [activeQuestionId]: next };
    });
  };

  const clearResponse = () => {
    if (!activeQuestionId) return;
    setAnswers((prev) => ({ ...prev, [activeQuestionId]: null }));
    setStates((prev) => {
      const cur = prev[activeQuestionId] ?? "NOT_VISITED";
      const next = nextQuestionState(cur, "clear", false);
      return { ...prev, [activeQuestionId]: next };
    });
  };

  const navigateTo = (questionId: string) => {
    for (const sec of exam.sections)
      if (sec.questions.some((q) => q.id === questionId))
        setActiveSectionId(sec.id);
    setActiveQuestionId(questionId);
  };

  const goNext = () => {
    if (!activeQuestion || !activeSection) return;
    const idx = activeSection!.questions.findIndex(
      (q) => q.id === activeQuestion.id
    );
    if (idx + 1 < activeSection!.questions.length) {
      setActiveQuestionId(activeSection!.questions[idx + 1]!.id);
    } else {
      const secIdx = exam.sections.findIndex((s) => s.id === activeSection!.id);
      if (secIdx + 1 < exam.sections.length) {
        const nextSec = exam.sections[secIdx + 1]!;
        setActiveSectionId(nextSec.id);
        setActiveQuestionId(nextSec.questions[0]?.id ?? null);
      }
    }
  };

  const goPrev = () => {
    if (!activeQuestion || !activeSection) return;
    const idx = activeSection!.questions.findIndex(
      (q) => q.id === activeQuestion.id
    );
    if (idx - 1 >= 0) {
      setActiveQuestionId(activeSection!.questions[idx - 1]!.id);
    } else {
      const secIdx = exam.sections.findIndex((s) => s.id === activeSection!.id);
      if (secIdx - 1 >= 0) {
        const prevSec = exam.sections[secIdx - 1]!;
        setActiveSectionId(prevSec.id);
        setActiveQuestionId(
          prevSec.questions[prevSec.questions.length - 1]?.id ?? null
        );
      }
    }
  };

  const saveAndNext = () => {
    if (activeQuestionId) {
      const hasAnswer = !!answers[activeQuestionId];
      if (hasAnswer) {
        setStates((prev) => {
          const cur = prev[activeQuestionId] ?? "NOT_VISITED";
          if (cur === "MARKED" || cur === "ANSWERED_MARKED")
            return { ...prev, [activeQuestionId]: "ANSWERED_MARKED" };
          return { ...prev, [activeQuestionId]: "ANSWERED" };
        });
      }
    }
    goNext();
  };

  const markAndNext = () => {
    if (!activeQuestionId) return;
    const hasAnswer = !!answers[activeQuestionId];
    setStates((prev) => {
      const cur = prev[activeQuestionId] ?? "NOT_VISITED";
      const next = nextQuestionState(cur, "mark", hasAnswer);
      return { ...prev, [activeQuestionId]: next };
    });
    goNext();
  };

  const handleSubmit = async (isAuto = false) => {
    if (!attemptId) {
      setSubmitted(true);
      return;
    }
    // Final sync before submit
    await syncToServer();
    try {
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: "POST",
        headers: {
          "Idempotency-Key": attemptId,
          "Content-Type": "application/json",
        },
      });
      const data = await res.json();
      if (!res.ok && !data.result)
        throw new Error(data.error || "Submit failed");
      // Clear recovery keys on success
      localStorage.removeItem(LS_ATTEMPT_KEY(exam.examId, exam.versionId));
      localStorage.removeItem(LS_ANSWERS_KEY(attemptId!));
      localStorage.removeItem(LS_STATES_KEY(attemptId!));
      setShowSubmitConfirm(false);
      if (isAuto) alert("Time expired — exam auto-submitted");
      router.push(`/exam/${exam.slug}/result/${attemptId}`);
      return;
    } catch (e) {
      console.error(e);
      // Even if server fails, show preview
      setSubmitted(true);
    }
  };

  const paletteItems = activeSection
    ? activeSection.questions.map((q) => ({
        id: q.id,
        number: globalIndexMap.get(q.id) ?? q.order + 1,
        state: states[q.id] ?? "NOT_VISITED",
      }))
    : [];
  const canPrev = (() => {
    if (!activeQuestion || !activeSection) return false;
    const qIdx = activeSection!.questions.findIndex(
      (q) => q.id === activeQuestion.id
    );
    if (qIdx > 0) return true;
    const secIdx = exam.sections.findIndex((s) => s.id === activeSection!.id);
    return secIdx > 0;
  })();
  const canNext = (() => {
    if (!activeQuestion || !activeSection) return false;
    const qIdx = activeSection!.questions.findIndex(
      (q) => q.id === activeQuestion.id
    );
    if (qIdx + 1 < activeSection!.questions.length) return true;
    const secIdx = exam.sections.findIndex((s) => s.id === activeSection!.id);
    return secIdx + 1 < exam.sections.length;
  })();

  if (isRecovering) {
    return (
      <div className="text-muted-foreground container mx-auto p-8 text-center text-sm">
        Loading exam...
      </div>
    );
  }

  if (!started) {
    const totalQuestions = allQuestions.length;
    const minutes = Math.round(totalSec / 60);
    return (
      <InstructionsScreen
        title={exam.title}
        instructions={exam.instructions}
        totalQuestions={totalQuestions}
        totalMinutes={minutes}
        sections={exam.sections.map((s) => ({
          name: s.name,
          count: s.questions.length,
        }))}
        onStart={createAttempt}
      />
    );
  }

  if (submitted) {
    const scored = allQuestions.map((q) => ({
      questionId: q.id,
      sectionId: q.sectionId,
      marks: q.marks,
      negativeMarks: q.negativeMarks,
      isBonus: q.isBonus,
      isCancelled: q.isCancelled,
      correctOptionId: q.correctOptionId,
      selectedOptionId: answers[q.id] ?? null,
    }));
    const result = computeScore(
      scored as never,
      exam.config.marking?.perSection,
      exam.config.marking?.default ?? { marks: 2, negative: 0.5 }
    );
    return (
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Exam Submitted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">Score</p>
                <p className="text-2xl font-bold">
                  {result.score} / {result.maxScore}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Attempted</p>
                <p className="text-2xl font-bold">
                  {result.attempted} / {allQuestions.length}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Correct</p>
                <p className="text-2xl font-bold">{result.correct}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Incorrect</p>
                <p className="text-2xl font-bold">{result.incorrect}</p>
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              Server-authoritative result saved.{" "}
              {attemptId ? `Attempt ${attemptId.slice(0, 8)}…` : "Preview"}{" "}
              Phase 6 will show full breakdown.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  localStorage.removeItem(
                    LS_ATTEMPT_KEY(exam.examId, exam.versionId)
                  );
                  window.location.reload();
                }}
              >
                Retake
              </Button>
              <Button
                variant="outline"
                onClick={() => (window.location.href = "/exams")}
              >
                Back to Library
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="bg-muted/20 flex min-h-[calc(100vh-3.5rem)] flex-col">
      <ExamHeader
        title={exam.title}
        remaining={formatted}
        remainingSec={remaining}
        warningSec={exam.config.timing.warningSec ?? 300}
      />
      <SectionTabs
        sections={exam.sections.map((s) => ({
          id: s.id,
          name: s.name,
          order: s.order,
        }))}
        activeId={activeSectionId}
        onChange={(id) => {
          setActiveSectionId(id);
          const sec = exam.sections.find((s) => s.id === id);
          if (sec) setActiveQuestionId(sec.questions[0]?.id ?? null);
        }}
      />
      <div className="flex flex-1 flex-col lg:flex-row">
        <div className="flex flex-1 flex-col gap-4 p-4">
          {activeQuestion ? (
            <QuestionViewer
              questionNumber={activeGlobalNumber}
              questionText={activeQuestion.text}
              options={activeQuestion.options.map((o) => ({
                id: o.id,
                label: o.label,
                text: o.text,
              }))}
              selectedOptionId={answers[activeQuestion.id] ?? null}
              onSelect={selectOption}
            />
          ) : (
            <Card>
              <CardContent className="p-6">No question</CardContent>
            </Card>
          )}
          <ExamControls
            onPrevious={goPrev}
            onClear={clearResponse}
            onMarkNext={markAndNext}
            onSaveNext={saveAndNext}
            canPrevious={canPrev}
            canNext={canNext}
          />
          <div className="flex justify-end">
            <Button
              variant="destructive"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={isCreating}
            >
              {isCreating ? "Starting..." : "Submit Exam"}
            </Button>
          </div>
        </div>
        <aside className="bg-card w-full border-t p-4 lg:w-80 lg:border-t-0 lg:border-l">
          <QuestionPalette
            items={paletteItems}
            activeId={activeQuestionId}
            onSelect={navigateTo}
          />
          <div className="bg-muted/50 mt-6 rounded-md border p-3 text-sm">
            <p className="font-medium">Time: {formatted}</p>
            <p className="text-muted-foreground text-xs">
              Syncs every 15s + on change. Refresh to test recovery.
            </p>
            {attemptId && (
              <p className="text-muted-foreground mt-1 text-[11px]">
                Attempt {attemptId.slice(0, 8)}…
              </p>
            )}
          </div>
        </aside>
      </div>
      {showSubmitConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Submit Exam?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm">
                Attempted {Object.values(answers).filter(Boolean).length} /{" "}
                {allQuestions.length}. Idempotent submit — safe to retry.
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowSubmitConfirm(false)}
                >
                  Cancel
                </Button>
                <Button onClick={() => handleSubmit(false)}>Submit</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
