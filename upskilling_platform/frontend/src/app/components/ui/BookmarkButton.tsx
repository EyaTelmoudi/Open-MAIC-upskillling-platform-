"use client";

import { useState, useEffect, useCallback } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { cn } from "@/app/lib/utils";
import {
  checkCourseBookmarked,
  checkLessonBookmarked,
  createBookmark,
  deleteBookmark,
  getCourseBookmarks,
  getLessonBookmarks,
} from "@/app/lib/api";

interface BookmarkButtonProps {
  courseId?: string;
  lessonId?: string;
  initialBookmarked?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function BookmarkButton({
  courseId,
  lessonId,
  initialBookmarked,
  className,
  size = "default",
}: BookmarkButtonProps) {
  const [isBookmarked, setIsBookmarked] = useState(initialBookmarked ?? false);
  const [isLoading, setIsLoading] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [bookmarkId, setBookmarkId] = useState<string | null>(null);

  const findBookmarkId = useCallback(async () => {
    try {
      if (courseId) {
        const bookmarks = await getCourseBookmarks();
        const found = bookmarks.find((b: any) => b.course_id === courseId);
        if (found) {
          setBookmarkId(found.id);
          return true;
        }
      } else if (lessonId) {
        const bookmarks = await getLessonBookmarks();
        const found = bookmarks.find((b: any) => b.lesson_id === lessonId);
        if (found) {
          setBookmarkId(found.id);
          return true;
        }
      }
    } catch (err) {
      console.error("Failed to find bookmark ID:", err);
    }
    return false;
  }, [courseId, lessonId]);

  useEffect(() => {
    async function checkBookmark() {
      if (!courseId && !lessonId) {
        setIsLoading(false);
        return;
      }
      try {
        let bookmarked = false;
        if (courseId) {
          bookmarked = await checkCourseBookmarked(courseId);
        } else if (lessonId) {
          bookmarked = await checkLessonBookmarked(lessonId);
        }
        setIsBookmarked(bookmarked);
        if (bookmarked) {
          await findBookmarkId();
        }
      } catch (err) {
        console.error("Failed to check bookmark status:", err);
      } finally {
        setIsLoading(false);
      }
    }
    checkBookmark();
  }, [courseId, lessonId, findBookmarkId]);

  const handleToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isToggling || isLoading) return;
    
    setIsToggling(true);
    try {
      if (isBookmarked && bookmarkId) {
        await deleteBookmark(bookmarkId);
        setBookmarkId(null);
      } else {
        const data = courseId 
          ? { course_id: courseId } 
          : { lesson_id: lessonId };
        const result = await createBookmark(data);
        setBookmarkId(result.id);
      }
      setIsBookmarked(!isBookmarked);
    } catch (err) {
      console.error("Failed to toggle bookmark:", err);
    } finally {
      setIsToggling(false);
    }
  };

  const sizeClasses = {
    sm: "h-7 w-7",
    default: "h-9 w-9",
    lg: "h-10 w-10",
  };

  const iconSizes = {
    sm: "h-3.5 w-3.5",
    default: "h-4 w-4",
    lg: "h-5 w-5",
  };

  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-full bg-black/60 backdrop-blur-sm",
          sizeClasses[size],
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-white" />
      </div>
    );
  }

  return (
    <button
      onClick={handleToggle}
      disabled={isToggling}
      className={cn(
        "flex items-center justify-center rounded-full transition-all hover:scale-110",
        isBookmarked
          ? "bg-primary text-white hover:bg-primary-light"
          : "bg-black/60 backdrop-blur-sm text-white hover:bg-black/80",
        sizeClasses[size],
        isToggling && "opacity-50",
        className
      )}
      title={isBookmarked ? "Remove bookmark" : "Add bookmark"}
    >
      {isToggling ? (
        <Loader2 className={cn("animate-spin", iconSizes[size])} />
      ) : (
        <Bookmark
          className={cn(iconSizes[size], isBookmarked && "fill-current")}
        />
      )}
    </button>
  );
}