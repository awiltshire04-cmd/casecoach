"use client";
import { useParams } from "next/navigation";
import { InterviewView } from "@/components/interview/InterviewView";
import { TECHNICAL_CATEGORIES } from "@/lib/interview/types";

export default function TechnicalInterviewPage() {
  const { id } = useParams<{ id: string }>();
  return <InterviewView section="technical" sessionId={id} categories={TECHNICAL_CATEGORIES} flaggable />;
}
