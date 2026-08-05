"use client";
import { useParams } from "next/navigation";
import { InterviewView } from "@/components/interview/InterviewView";
import { BEHAVIORAL_CATEGORIES } from "@/lib/interview/types";

export default function BehavioralInterviewPage() {
  const { id } = useParams<{ id: string }>();
  return <InterviewView section="behavioral" sessionId={id} categories={BEHAVIORAL_CATEGORIES} />;
}
