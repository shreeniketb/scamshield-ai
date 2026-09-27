import { Skeleton } from "@/components/ui/Skeleton";

export default function CommunityLoading() {
  return (
    <>
      <div className="col-span-12 space-y-3">
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-12 w-72" />
      </div>
      <div className="col-span-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Skeleton className="h-40 md:col-span-2" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
      <Skeleton className="col-span-12 h-96 lg:col-span-7" />
      <Skeleton className="col-span-12 h-96 lg:col-span-5" />
      <Skeleton className="col-span-12 h-80 lg:col-span-7" />
      <Skeleton className="col-span-12 h-80 lg:col-span-5" />
      <Skeleton className="col-span-12 h-[28rem]" />
    </>
  );
}
