"use client";
import { useParams } from "next/navigation";
import { AnswerView } from "@/components/interview/AnswerView";
import { TECHNICAL_CATEGORIES } from "@/lib/interview/types";

export default function TechnicalQuestionPage() {
  const { id } = useParams<{ id: string }>();
  return <AnswerView section="technical" questionId={id} categories={TECHNICAL_CATEGORIES} flaggable />;
}
