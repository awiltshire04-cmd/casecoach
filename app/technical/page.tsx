"use client";
import { BankView } from "@/components/interview/BankView";
import { TECHNICAL_CATEGORIES } from "@/lib/interview/types";

export default function TechnicalPage() {
  return (
    <BankView
      section="technical"
      categories={TECHNICAL_CATEGORIES}
      eyebrow="Technical"
      title="PE concepts and mechanics"
      blurb="Answer out loud and get graded on whether you were actually right — correctness and completeness first, polish second. Flag what catches you out and drill it in study mode."
      interviewBlurb="Questions drawn at random and asked one at a time. Follow-ups come only when an answer leaves a real gap."
      seedable
      studyHref="/technical/study"
    />
  );
}
