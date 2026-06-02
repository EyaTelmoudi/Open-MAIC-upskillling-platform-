"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { AppShell } from "@/app/components/layout/AppShell";
import { Button } from "@/app/components/ui/Button";
import { Badge } from "@/app/components/ui/Badge";
import { Card } from "@/app/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/Tabs";
import { BookmarkButton } from "@/app/components/ui/BookmarkButton";
import { api } from "@/app/lib/api";
import { useAuth } from "@/app/context/AuthContext";
import { resolveStoredMediaUrl } from "@/app/lib/media";
import {
  ArrowLeft,
  Clock,
  Star,
  Users,
  BookOpen,
  PlayCircle,
  FileText,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Lock,
  Calendar,
  Eye,
  Send,
  ThumbsUp,
  MessageSquare,
} from "lucide-react";

interface Review {
  id: string;
  course_id: string;
  user_id: string;
  user_name: string | null;
  user_avatar: string | null;
  rating: number;
  review_text: string | null;
  created_at: string;
}

interface ReviewStats {
  average_rating: number;
  total_reviews: number;
  rating_distribution: Record<number, number>;
}

interface Module {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: Lesson[];
}

interface Lesson {
  id: string;
  title: string;
  content_type: string;
  duration: number;
  order: number;
}

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  category: string;
  difficulty: string;
  duration: number;
  xp_reward: number;
  rating: number | null;
  is_published: boolean;
  author_id: string | null;
  modules: Module[];
}

const difficultyColors: Record<string, { bg: string; text: string }> = {
  Beginner: { bg: "bg-green-500/10", text: "text-green-500" },
  Intermediate: { bg: "bg-amber-500/10", text: "text-amber-500" },
  Advanced: { bg: "bg-red-500/10", text: "text-red-500" },
};

const contentTypeIcons: Record<string, typeof PlayCircle> = {
  video: PlayCircle,
  text: FileText,
  quiz: CheckCircle,
};

const mockCourse: Course = {
  id: "1",
  title: "Introduction to AI Tools",
  description:
    "Learn how to use AI tools effectively in your daily workflow. This comprehensive course covers the fundamentals of AI, practical applications, and how to integrate AI tools into your existing processes. Perfect for beginners who want to understand the power of AI.",
  thumbnail: null,
  category: "Technology",
  difficulty: "Beginner",
  duration: 120,
  xp_reward: 100,
  rating: 4.5,
  is_published: true,
  author_id: null,
  modules: [
    {
      id: "m1",
      title: "Getting Started with AI",
      description: "Introduction to AI concepts and tools",
      order: 1,
      lessons: [
        { id: "l1", title: "What is AI?", content_type: "video", duration: 15, order: 1 },
        { id: "l2", title: "Types of AI Tools", content_type: "text", duration: 10, order: 2 },
        { id: "l3", title: "Knowledge Check", content_type: "quiz", duration: 10, order: 3 },
      ],
    },
    {
      id: "m2",
      title: "Practical Applications",
      description: "Real-world AI use cases",
      order: 2,
      lessons: [
        { id: "l4", title: "AI in Writing", content_type: "video", duration: 20, order: 1 },
        { id: "l5", title: "AI in Analysis", content_type: "video", duration: 25, order: 2 },
        { id: "l6", title: "AI in Planning", content_type: "text", duration: 15, order: 3 },
      ],
    },
    {
      id: "m3",
      title: "Advanced Techniques",
      description: "Master AI tool usage",
      order: 3,
      lessons: [
        { id: "l7", title: "Prompt Engineering", content_type: "video", duration: 30, order: 1 },
        { id: "l8", title: "Custom Workflows", content_type: "text", duration: 20, order: 2 },
        { id: "l9", title: "Final Assessment", content_type: "quiz", duration: 15, order: 3 },
      ],
    },
  ],
};

function CourseDetailContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const courseId = params.id as string;
  const [course, setCourse] = useState<Course | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [userReview, setUserReview] = useState<Review | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [newRating, setNewRating] = useState<number | null>(null);
  const [newReviewText, setNewReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [activeTab, setActiveTab] = useState("curriculum");
  const [isBookmarked, setIsBookmarked] = useState(false);

  const previewToken = searchParams.get("token");

  useEffect(() => {
    async function validatePreview() {
      if (!previewToken) return;
      try {
        const result = await api.get<{ valid: boolean }>(
          `/api/v1/learning/courses/${courseId}/preview?token=${previewToken}`
        );
        if (result.valid) {
          setIsPreviewMode(true);
          setIsEnrolled(true);
        }
      } catch (err) {
        console.error("Preview validation failed:", err);
      }
    }
    validatePreview();
  }, [courseId, previewToken]);

  useEffect(() => {
    async function loadCourse() {
      try {
        const data = await api.get<Course>(`/api/v1/learning/courses/${courseId}`);
        setCourse(data);
        if (data.modules.length > 0) {
          setExpandedModules(new Set([data.modules[0].id]));
        }
      } catch (err) {
        console.error("Failed to load course:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadCourse();
  }, [courseId]);

  useEffect(() => {
    async function checkEnrollment() {
      if (!user) return;
      try {
        const enrollments = await api.get<{ id: string; course_id: string }[]>(
          `/api/v1/learning/enrollments/?user_id=${user.id}`
        );
        const enrolled = enrollments.some(
          (e) => e.course_id === courseId
        );
        setIsEnrolled(enrolled);
      } catch (err) {
        console.error("Failed to check enrollment:", err);
      }
    }
    checkEnrollment();
  }, [user, courseId]);

  useEffect(() => {
    async function checkBookmark() {
      if (!user) return;
      try {
        const { checkCourseBookmarked } = await import("@/app/lib/api");
        const bookmarked = await checkCourseBookmarked(courseId);
        setIsBookmarked(bookmarked);
      } catch (err) {
        console.error("Failed to check bookmark:", err);
      }
    }
    checkBookmark();
  }, [user, courseId]);

  useEffect(() => {
    async function loadReviews() {
      try {
        const [reviewsData, statsData, myReview] = await Promise.all([
          api.get<Review[]>(`/api/v1/learning/courses/${courseId}/reviews`),
          api.get<ReviewStats>(`/api/v1/learning/courses/${courseId}/reviews/stats`),
          user ? api.get<Review | null>(`/api/v1/learning/courses/${courseId}/my-review`) : Promise.resolve(null),
        ]);
        setReviews(reviewsData);
        setReviewStats(statsData);
        if (myReview) setUserReview(myReview);
      } catch (err) {
        console.error("Failed to load reviews:", err);
      }
    }
    loadReviews();
  }, [courseId, user]);

  const submitReview = async () => {
    if (!newRating) return;
    setSubmittingReview(true);
    try {
      if (userReview) {
        await api.put(`/api/v1/learning/courses/${courseId}/reviews`, {
          rating: newRating,
          review_text: newReviewText || null,
        });
      } else {
        await api.post(`/api/v1/learning/courses/${courseId}/reviews`, {
          rating: newRating,
          review_text: newReviewText || null,
        });
      }
      // Reload reviews
      const [reviewsData, statsData, myReview] = await Promise.all([
        api.get<Review[]>(`/api/v1/learning/courses/${courseId}/reviews`),
        api.get<ReviewStats>(`/api/v1/learning/courses/${courseId}/reviews/stats`),
        api.get<Review | null>(`/api/v1/learning/courses/${courseId}/my-review`),
      ]);
      setReviews(reviewsData);
      setReviewStats(statsData);
      setUserReview(myReview);
      setShowReviewForm(false);
      setNewRating(null);
      setNewReviewText("");
      router.refresh();
    } catch (err) {
      console.error("Failed to submit review:", err);
      alert("Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const toggleModule = (moduleId: string) => {
    const newExpanded = new Set(expandedModules);
    if (newExpanded.has(moduleId)) {
      newExpanded.delete(moduleId);
    } else {
      newExpanded.add(moduleId);
    }
    setExpandedModules(newExpanded);
  };

  const handleEnroll = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    try {
      await api.post("/api/v1/learning/enrollments/", {
        user_id: user.id,
        course_id: courseId,
      });
      // Find first lesson and redirect to learning page
      const firstModule = course?.modules[0];
      if (firstModule && firstModule.lessons.length > 0) {
        router.push(`/learn/${courseId}/${firstModule.lessons[0].id}`);
      } else {
        setIsEnrolled(true);
      }
    } catch (err) {
      console.error("Failed to enroll:", err);
      alert("Failed to enroll. Please try again.");
    }
  };

  const totalLessons = course?.modules.reduce(
    (acc, m) => acc + m.lessons.length,
    0
  ) || 0;

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-text-secondary">Course not found</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Preview Mode Banner */}
        {isPreviewMode && (
          <div className="flex items-center justify-between px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-amber-500" />
              <span className="text-amber-500 font-medium">Preview Mode</span>
              <span className="text-text-secondary text-sm">
                You are previewing this course
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await api.delete(
                    `/api/v1/learning/courses/${courseId}/preview-token`
                  );
                  router.push(`/courses/${courseId}`);
                } catch (err) {
                  console.error("Failed to revoke preview token:", err);
                  window.location.href = `/courses/${courseId}`;
                }
              }}
            >
              Exit Preview
            </Button>
          </div>
        )}

        {/* Back button */}
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Courses
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
{/* Hero with Video Preview */}
            <Card>
              {/* Video Area - Shows when enrolled */}
              {isEnrolled ? (
                <div className="relative aspect-video rounded-t-xl bg-slate-100 flex items-center justify-center group cursor-pointer"
                     onClick={() => {
                       const firstModule = course.modules[0];
                       if (firstModule && firstModule.lessons.length > 0) {
                         router.push(
                           `/learn/${course.id}/${firstModule.lessons[0].id}`
                         );
                       }
                     }}>
                  {course.thumbnail ? (
                    <img
                      src={resolveStoredMediaUrl(course.thumbnail)}
                      alt={course.title}
                      className="h-full w-full object-cover rounded-t-xl"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-3xl bg-white/78 px-8 py-6 backdrop-blur-sm">
                      <PlayCircle className="h-20 w-20 text-primary/55 group-hover:text-primary transition-colors" />
                      <p className="mt-2 text-sm font-semibold text-slate-800">Click to start learning</p>
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-white/18 opacity-0 transition-opacity group-hover:opacity-100">
                    <div className="rounded-full bg-white/88 p-4 shadow-lg backdrop-blur-sm">
                      <PlayCircle className="h-16 w-16 text-primary" />
                    </div>
                  </div>
                </div>
              ) : (
                /* Thumbnail for non-enrolled users */
                <div className="relative aspect-video rounded-t-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                  {course.thumbnail ? (
                    <img
                      src={resolveStoredMediaUrl(course.thumbnail)}
                      alt={course.title}
                      className="h-full w-full object-cover rounded-t-xl"
                    />
                  ) : (
                    <BookOpen className="h-20 w-20 text-primary/30" />
                  )}
                </div>
              )}
              <div className="p-6">
                <div className="flex items-center gap-2 mb-2">
                  <Badge
                    className={`${
                      difficultyColors[course.difficulty]?.bg || "bg-gray-500/10"
                    } ${
                      difficultyColors[course.difficulty]?.text || "text-gray-500"
                    }`}
                  >
                    {course.difficulty}
                  </Badge>
                  <Badge variant="outline">{course.category}</Badge>
                </div>
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-2xl font-bold text-text-primary">
                    {course.title}
                  </h1>
                  {user && (
                    <BookmarkButton
                      courseId={course.id}
                      initialBookmarked={isBookmarked}
                    />
                  )}
                </div>
                <p className="text-text-secondary">{course.description}</p>

                {/* Stats */}
                <div className="flex items-center gap-6 mt-4 text-sm">
                  <span className="flex items-center gap-1 text-text-secondary">
                    <Clock className="h-4 w-4" />
                    {Math.round(course.duration / 60)}h
                  </span>
                  <button 
                    className="flex items-center gap-1 text-amber-500 hover:text-amber-400 cursor-pointer"
                    onClick={() => setActiveTab("reviews")}
                  >
                    <Star className="h-4 w-4 fill-current" />
                    {reviewStats && reviewStats.total_reviews > 0 
                      ? `${reviewStats.average_rating} (${reviewStats.total_reviews})`
                      : course.rating || "-"
                    }
                  </button>
                  <span className="flex items-center gap-1 text-text-secondary">
                    <BookOpen className="h-4 w-4" />
                    {totalLessons} lessons
                  </span>
                  <span className="flex items-center gap-1 text-text-secondary">
                    <Users className="h-4 w-4" />
                    150 enrolled
                  </span>
                </div>
              </div>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="curriculum" value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="curriculum">Curriculum</TabsTrigger>
                <TabsTrigger value="reviews" data-tab-trigger="reviews">Reviews</TabsTrigger>
              </TabsList>

              <TabsContent value="curriculum" className="mt-4">
                <Card>
                  <div className="p-4 border-b border-border">
                    <h3 className="font-semibold text-text-primary">
                      Course Curriculum
                    </h3>
                    <p className="text-sm text-text-secondary">
                      {course.modules.length} modules • {totalLessons} lessons
                    </p>
                  </div>
                  <div className="divide-y divide-border">
                    {course.modules.map((module, idx) => {
                      const Icon = expandedModules.has(module.id)
                        ? ChevronDown
                        : ChevronRight;
                      return (
                        <div key={module.id}>
                          <button
                            onClick={() => toggleModule(module.id)}
                            className="w-full flex items-center justify-between p-4 hover:bg-background/50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-sm font-medium text-primary">
                                {idx + 1}
                              </div>
                              <div className="text-left">
                                <p className="font-medium text-text-primary">
                                  {module.title}
                                </p>
                                <p className="text-xs text-text-secondary">
                                  {module.lessons.length} lessons
                                </p>
                              </div>
                            </div>
                            <Icon className="h-4 w-4 text-text-secondary" />
                          </button>
                          {expandedModules.has(module.id) && (
                            <div className="bg-background/30 pb-2">
                              {module.lessons.map((lesson) => {
                                const LessonIcon =
                                  contentTypeIcons[lesson.content_type] ||
                                  FileText;
                                return (
                                  <button
                                    key={lesson.id}
                                    className="w-full flex items-center gap-3 px-4 py-2 pl-14 hover:bg-background/50 transition-colors"
                                  >
                                    <LessonIcon className="h-4 w-4 text-text-secondary" />
                                    <span className="flex-1 text-left text-sm text-text-primary">
                                      {lesson.title}
                                    </span>
                                    <span className="text-xs text-text-secondary">
                                      {lesson.duration}min
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="overview" className="mt-4">
                <Card>
                  <div className="p-6">
                    <h3 className="font-semibold text-text-primary mb-4">
                      About this course
                    </h3>
                    <p className="text-text-secondary whitespace-pre-wrap">
                      {course.description}
                    </p>

                    <h4 className="font-semibold text-text-primary mt-6 mb-2">
                      What you will learn
                    </h4>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2 text-text-secondary">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-1" />
                        Understand AI fundamentals
                      </li>
                      <li className="flex items-start gap-2 text-text-secondary">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-1" />
                        Use AI tools in daily workflows
                      </li>
                      <li className="flex items-start gap-2 text-text-secondary">
                        <CheckCircle className="h-4 w-4 text-green-500 mt-1" />
                        Write effective prompts
                      </li>
                    </ul>
                  </div>
                </Card>
              </TabsContent>

              <TabsContent value="reviews" className="mt-4">
                {reviewStats && reviewStats.total_reviews > 0 ? (
                  <>
                    {/* Review Stats Summary */}
                    <Card className="mb-4">
                      <div className="p-6">
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <div className="text-4xl font-bold text-text-primary">
                              {reviewStats.average_rating}
                            </div>
                            <div className="flex items-center justify-center gap-1 mt-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  className={`h-4 w-4 ${
                                    star <= Math.round(reviewStats.average_rating)
                                      ? "text-amber-500 fill-amber-500"
                                      : "text-gray-600"
                                  }`}
                                />
                              ))}
                            </div>
                            <p className="text-sm text-text-secondary mt-1">
                              {reviewStats.total_reviews} review
                              {reviewStats.total_reviews !== 1 ? "s" : ""}
                            </p>
                          </div>
                          
                          <div className="flex-1 space-y-1">
                            {[5, 4, 3, 2, 1].map((rating) => {
                              const count = reviewStats.rating_distribution[rating] || 0;
                              const percentage = reviewStats.total_reviews > 0
                                ? (count / reviewStats.total_reviews) * 100
                                : 0;
                              return (
                                <div key={rating} className="flex items-center gap-2">
                                  <span className="text-xs text-text-secondary w-3">
                                    {rating}
                                  </span>
                                  <Star className="h-3 w-3 text-amber-500" />
                                  <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-amber-500 rounded-full"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-text-secondary w-8 text-right">
                                    {count}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </Card>

                    {/* Write Review Button */}
                    {user && isEnrolled && !userReview && (
                      <Card className="mb-4">
                        <div className="p-6">
                          <h3 className="font-semibold text-text-primary mb-3">
                            Share Your Experience
                          </h3>
                          <Button
                            variant="outline"
                            onClick={() => setShowReviewForm(true)}
                          >
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Write a Review
                          </Button>
                        </div>
                      </Card>
                    )}

                    {/* Review Form */}
                    {showReviewForm && (
                      <Card className="mb-4">
                        <div className="p-6">
                          <h3 className="font-semibold text-text-primary mb-4">
                            {userReview ? "Update Your Review" : "Write a Review"}
                          </h3>
                          
                          <div className="mb-4">
                            <label className="text-sm text-text-secondary mb-2 block">
                              Your Rating
                            </label>
                            <div className="flex gap-2">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button
                                  key={star}
                                  onClick={() => setNewRating(star)}
                                  className="p-1 hover:scale-110 transition-transform"
                                >
                                  <Star
                                    className={`h-6 w-6 ${
                                      star <= (newRating || 0)
                                        ? "text-amber-500 fill-amber-500"
                                        : "text-gray-600 hover:text-amber-500"
                                    }`}
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                          
                          <div className="mb-4">
                            <label className="text-sm text-text-secondary mb-2 block">
                              Your Review (optional)
                            </label>
                            <textarea
                              value={newReviewText}
                              onChange={(e) => setNewReviewText(e.target.value)}
                              placeholder="Share your experience with this course..."
                              className="w-full h-24 px-3 py-2 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary resize-none"
                            />
                          </div>
                          
                          <div className="flex gap-2">
                            <Button
                              onClick={submitReview}
                              disabled={!newRating || submittingReview}
                            >
                              {submittingReview ? (
                                "Submitting..."
                              ) : (
                                <>
                                  <Send className="h-4 w-4 mr-2" />
                                  {userReview ? "Update Review" : "Submit Review"}
                                </>
                              )}
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() => {
                                setShowReviewForm(false);
                                setNewRating(userReview?.rating || null);
                                setNewReviewText(userReview?.review_text || "");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}

                    {/* Reviews List */}
                    <div className="space-y-3">
                      {reviews.map((review) => (
                        <Card key={review.id}>
                          <div className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                                  {review.user_avatar ? (
                                    <img
                                      src={review.user_avatar}
                                      alt={review.user_name || "User"}
                                      className="h-10 w-10 rounded-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-primary font-medium">
                                      {(review.user_name || "U")[0].toUpperCase()}
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <p className="font-medium text-text-primary">
                                    {review.user_name || "Anonymous User"}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <div className="flex">
                                      {[1, 2, 3, 4, 5].map((star) => (
                                        <Star
                                          key={star}
                                          className={`h-3 w-3 ${
                                            star <= review.rating
                                              ? "text-amber-500 fill-amber-500"
                                              : "text-gray-600"
                                          }`}
                                        />
                                      ))}
                                    </div>
                                    <span className="text-xs text-text-secondary">
                                      {new Date(review.created_at).toLocaleDateString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              {review.user_id === user?.id && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setUserReview(review);
                                    setNewRating(review.rating);
                                    setNewReviewText(review.review_text || "");
                                    setShowReviewForm(true);
                                  }}
                                >
                                  Edit
                                </Button>
                              )}
                            </div>
                            {review.review_text && (
                              <p className="text-text-secondary text-sm mt-2">
                                {review.review_text}
                              </p>
                            )}
                          </div>
                        </Card>
                      ))}
                      
                      {reviews.length === 0 && (
                        <Card>
                          <div className="p-6 text-center">
                            <MessageSquare className="h-10 w-10 text-text-secondary mx-auto mb-3" />
                            <p className="text-text-secondary">
                              No reviews yet. Be the first to review!
                            </p>
                          </div>
                        </Card>
                      )}
                    </div>
                  </>
                ) : (
                  <Card>
                    <div className="p-6 text-center">
                      <Star className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                      <h3 className="font-semibold text-text-primary mb-2">
                        No Reviews Yet
                      </h3>
                      <p className="text-sm text-text-secondary mb-4">
                        Be the first to review this course!
                      </p>
                      {user && isEnrolled && (
                        <Button onClick={() => setShowReviewForm(true)}>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Write a Review
                        </Button>
                      )}
                    </div>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <Card className="sticky top-6">
              <div className="p-6">
                {/* Preview Mode Button for Author */}
                {isPreviewMode ? (
                  <>
                    <div className="flex items-center gap-2 mb-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                      <Eye className="h-5 w-5 text-amber-500" />
                      <span className="text-amber-500 font-medium">Preview Mode</span>
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await api.delete(
                            `/api/v1/learning/courses/${courseId}/preview-token`
                          );
                          router.refresh();
                        } catch (err) {
                          console.error("Failed to revoke preview token:", err);
                        }
                      }}
                    >
                      Exit Preview
                    </Button>
                  </>
                ) : user && user.role === "Admin" && course?.author_id === user.id ? (
                  <Button
                    className="w-full"
                    size="lg"
                    variant="outline"
                    onClick={async () => {
                      try {
                        const result = await api.post<{ preview_url: string }>(
                          `/api/v1/learning/courses/${courseId}/preview-token`
                        );
                        router.push(result.preview_url);
                      } catch (err) {
                        console.error("Failed to generate preview token:", err);
                        alert("Failed to generate preview token");
                      }
                    }}
                  >
                    <Eye className="h-5 w-5 mr-2" />
                    Preview Course
                  </Button>
                ) : isEnrolled ? (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => {
                      const firstModule = course.modules[0];
                      if (firstModule && firstModule.lessons.length > 0) {
                        router.push(
                          `/learn/${course.id}/${firstModule.lessons[0].id}`
                        );
                      }
                    }}
                  >
                    <PlayCircle className="h-5 w-5 mr-2" />
                    Continue Learning
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleEnroll}
                  >
                    <BookOpen className="h-5 w-5 mr-2" />
                    Enroll Now
                  </Button>
                )}
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Duration</span>
                    <span className="text-text-primary">
                      {Math.round(course.duration / 60)} hours
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Modules</span>
                    <span className="text-text-primary">{course.modules.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Lessons</span>
                    <span className="text-text-primary">{totalLessons}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Difficulty</span>
                    <span className="text-text-primary">{course.difficulty}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Certificate</span>
                    <span className="text-text-primary Yes">Yes</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

export default function CourseDetailPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </AppShell>
    }>
      <CourseDetailContent />
    </Suspense>
  );
}
