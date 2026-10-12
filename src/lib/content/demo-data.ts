import type { SiteProfile } from "@/lib/content/types";
import { careerProfile } from "@/lib/content/career-profile";

export const demoProfile: SiteProfile = {
  displayName: careerProfile.displayName,
  roleTitle: careerProfile.roleTitle,
  headline: careerProfile.headline,
  bio: careerProfile.bio,
  email: "swoorim31@gmail.com",
  socialLinks: [
    { label: "GitHub", href: "https://github.com/SKK-woorim" },
  ],
  skills: careerProfile.skills,
};
