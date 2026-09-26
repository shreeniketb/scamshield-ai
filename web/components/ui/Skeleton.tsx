type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className = "h-4 w-full" }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-card bg-line ${className}`}
    />
  );
}
