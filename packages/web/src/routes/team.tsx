import { createRoute } from "@tanstack/react-router";
import { useUsers } from "@/hooks/use-users";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { dashboardRoute } from "./dashboard";

export const teamRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/team",
  component: TeamPage,
});

function TeamPage() {
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const users = usersData?.users ?? [];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="Team" />

      <div className="mt-6">
        {usersLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
              <span className="w-10">Avatar</span>
              <span className="flex-1">Name</span>
              <span className="w-48">Email</span>
              <span className="w-20">Role</span>
            </div>
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <div className="w-10">
                  <UserAvatar
                    name={user.name}
                    avatarUrl={user.avatarUrl}
                    size="sm"
                  />
                </div>
                <span className="flex-1 text-sm font-medium">
                  {user.name}
                </span>
                <span className="w-48 text-sm text-muted-foreground truncate">
                  {user.email}
                </span>
                <div className="w-20">
                  <Badge variant="secondary">{user.role}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
