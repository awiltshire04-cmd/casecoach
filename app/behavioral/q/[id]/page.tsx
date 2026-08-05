"use client";
import { useParams } from "next/navigation";
import { AnswerView } from "@/components/interview/AnswerView";
import { BEHAVIORAL_CATEGORIES } from "@/lib/interview/types";

export default function BehavioralQuestionPage() {
  const { id } = useParams<{ id: string }>();
  return <AnswerView section="behavioral" questionId={id} categories={BEHAVIORAL_CATEGORIES} />;
}
