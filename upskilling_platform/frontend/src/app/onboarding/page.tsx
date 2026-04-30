"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/app/lib/api";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";

interface OnboardingProgress {
  current_step: number;
  completed_steps: number[];
  profile_completed: boolean;
  skills_completed: boolean;
  goals_completed: boolean;
  recommendation_completed: boolean;
}

interface OnboardingCheck {
  needs_onboarding: boolean;
  onboarded: boolean;
  status: string;
}

interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  department: string | null;
  role: string;
  status: string;
  onboarded: boolean;
}

const ONBOARDING_EXEMPT_ROLES = new Set([
  "Admin",
  "Manager",
  "TeamManager",
  "LearningExpert",
]);

const STEPS = [
  { id: 1, title: "Welcome", description: "Welcome to SkillForge! Let's get you set up." },
  { id: 2, title: "Profile Setup", description: "Tell us about yourself." },
  { id: 3, title: "Skills", description: "Select your areas of interest." },
  { id: 4, title: "Goals", description: "What do you want to achieve?" },
];

const SKILL_OPTIONS = [
  "JavaScript", "Python", "TypeScript", "React", "Node.js",
  "Data Analysis", "Machine Learning", "Cloud Computing",
  "Project Management", "Communication", "Leadership",
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  
  // Form data
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [department, setDepartment] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [targetDate, setTargetDate] = useState("");

  useEffect(() => {
    checkOnboardingStatus();
  }, []);

  async function checkOnboardingStatus() {
    try {
      // Check if onboarding is needed
      const progress = await api.get<OnboardingCheck>("/api/v1/onboarding/check");
      
      if (!progress.needs_onboarding) {
        // Already onboarded - redirect to dashboard
        router.push("/");
        return;
      }

      // Get current progress
      const onboardingProgress = await api.get<OnboardingProgress>("/api/v1/onboarding/progress");
      setStep(onboardingProgress.current_step || 1);

      // Get current user profile for pre-fill
      const profile = await api.get<UserProfile>("/api/v1/identity/users/me");
      if (ONBOARDING_EXEMPT_ROLES.has(profile.role)) {
        router.push("/");
        return;
      }
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setDepartment(profile.department || "");
    } catch (err) {
      console.error("Error checking onboarding:", err);
      setError("Failed to load onboarding data");
    } finally {
      setLoading(false);
    }
  }

  async function handleNext() {
    setSubmitting(true);
    setError("");

    try {
      switch (step) {
        case 2: // Profile
          await api.post("/api/v1/onboarding/step/profile", {
            first_name: firstName,
            last_name: lastName,
            department: department || null,
          });
          setStep(3);
          break;
          
        case 3: // Skills
          await api.post("/api/v1/onboarding/step/skills", {
            skills: selectedSkills,
          });
          setStep(4);
          break;
          
        case 4: // Goals
          await api.post("/api/v1/onboarding/step/goals", {
            title: goalTitle,
            description: goalDescription || null,
            target_date: targetDate || null,
          });
          // Complete onboarding
          await api.post("/api/v1/onboarding/complete");
          router.push("/");
          break;
          
        default:
          setStep(step + 1);
      }
    } catch (err: any) {
      setError(err.message || "Failed to save progress");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSkip() {
    if (step === 4) {
      // Skip course selection and complete
      setSubmitting(true);
      try {
        await api.post("/api/v1/onboarding/step/recommendation", {
          skip: true,
        });
        await api.post("/api/v1/onboarding/complete");
        router.push("/");
      } catch (err: any) {
        setError(err.message || "Failed to complete onboarding");
      } finally {
        setSubmitting(false);
      }
    }
  }

  function toggleSkill(skill: string) {
    setSelectedSkills(prev => 
      prev.includes(skill) 
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0F1117]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] flex items-center justify-center">
      <div className="max-w-2xl w-full mx-4">
        {/* Progress Steps */}
        <div className="flex justify-between mb-8 px-4">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex flex-col items-center">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center font-bold
                ${step >= s.id ? "bg-[#6C63FF] text-white" : "bg-[#2A2D3E] text-gray-400"}
              `}>
                {step > s.id ? "✓" : s.id}
              </div>
              <span className={`text-xs mt-2 ${step >= s.id ? "text-white" : "text-gray-400"}`}>
                {s.title}
              </span>
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-[#1A1D27] rounded-2xl p-8 border border-[#2A2D3E]">
          {/* Step Content */}
          {step === 1 && (
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white mb-4">
                Welcome to SkillForge! 🎉
              </h1>
              <p className="text-gray-400 mb-6">
                We're excited to have you here. Let's get you set up with your personalized learning experience.
                This will only take a few minutes.
              </p>
              <div className="bg-[#2A2D3E] rounded-xl p-6 text-left">
                <h3 className="text-white font-semibold mb-3">What you'll do:</h3>
                <ul className="text-gray-400 space-y-2">
                  <li>✓ Confirm your profile information</li>
                  <li>✓ Select skills you're interested in</li>
                  <li>✓ Set your learning goals</li>
                  <li>✓ Get your first course recommendation</li>
                </ul>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Profile Setup</h2>
              <p className="text-gray-400 mb-6">Confirm your profile details. Department is optional and will keep the value already assigned by your admin if you leave it unchanged.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white mb-2">First Name</label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Enter your first name"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Last Name</label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Enter your last name"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Department (optional)</label>
                  <Input
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    placeholder="Already assigned by your admin, if any"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Skills</h2>
              <p className="text-gray-400 mb-6">
                Select skills you'd like to learn or improve. You can always change these later.
              </p>
              
              <div className="flex flex-wrap gap-2">
                {SKILL_OPTIONS.map((skill) => (
                  <button
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className={`
                      px-4 py-2 rounded-lg border transition-colors
                      ${selectedSkills.includes(skill)
                        ? "bg-[#6C63FF] border-[#6C63FF] text-white"
                        : "bg-[#2A2D3E] border-[#2A2D3E] text-gray-300 hover:border-[#6C63FF]"
                      }
                    `}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Learning Goals</h2>
              <p className="text-gray-400 mb-6">
                What do you want to achieve with your learning? Set a goal to stay motivated.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-white mb-2">Goal Title</label>
                  <Input
                    value={goalTitle}
                    onChange={(e) => setGoalTitle(e.target.value)}
                    placeholder="e.g., Learn Python basics"
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Description (optional)</label>
                  <textarea
                    value={goalDescription}
                    onChange={(e) => setGoalDescription(e.target.value)}
                    placeholder="Describe your goal in more detail..."
                    className="w-full bg-[#2A2D3E] border border-[#2A2D3E] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-[#6C63FF]"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="block text-white mb-2">Target Date (optional)</label>
                  <Input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between mt-8">
            {step > 1 ? (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            ) : (
              <div />
            )}
            
            <div className="flex gap-3">
              {step === 4 && (
                <Button
                  variant="ghost"
                  onClick={handleSkip}
                  disabled={submitting}
                >
                  Skip
                </Button>
              )}
              <Button
                onClick={handleNext}
                disabled={submitting}
              >
                {submitting ? "Saving..." : step === 4 ? "Complete" : "Continue"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
