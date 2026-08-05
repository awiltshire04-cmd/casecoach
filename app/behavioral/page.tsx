"use client";
import { BankView } from "@/components/interview/BankView";
import { BEHAVIORAL_CATEGORIES } from "@/lib/interview/types";

export default function BehavioralPage() {
  return (
    <BankView
      section="behavioral"
      categories={BEHAVIORAL_CATEGORIES}
      eyebrow="Behavioral"
      title="Story and delivery"
      blurb="Answer out loud. Every rep is graded on content, structure, delivery and articulation — then stored so you can watch the pattern change."
      interviewBlurb="Questions drawn at random and asked one at a time. Follow-ups come only when an answer invites one — same as a real interviewer."
    />
  );
}
