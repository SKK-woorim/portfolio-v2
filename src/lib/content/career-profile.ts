import profile from "../../../data/content/profile.json";

export type CareerProjectSummary = {
  slug: string;
  title: string;
  period: string;
  customer: string;
  role: string;
  summary: string;
};

export type CareerProfile = {
  displayName: string;
  roleTitle: string;
  headline: string;
  bio: string;
  skills: string[];
  currentCareer: {
    company: string;
    organization: string;
    employment: string;
    description: string;
  };
  strengths: string[];
  projects: CareerProjectSummary[];
};

export const careerProfile: CareerProfile = profile;
