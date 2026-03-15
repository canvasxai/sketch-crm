import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useUsers, useCreateUser, useDeleteUser } from "@/hooks/use-users";
import { useSession } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash } from "@phosphor-icons/react";
import { dashboardRoute } from "./dashboard";

export const teamRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/team",
  component: TeamPage,
});

function TeamPage() {
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const { data: session } = useSession();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const users = usersData?.users ?? [];

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  function handleAdd() {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;
    const trimmedName = name.trim() || trimmedEmail.split("@")[0];
    createUser.mutate(
      { name: trimmedName, email: trimmedEmail },
      {
        onSuccess: () => {
          setEmail("");
          setName("");
        },
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="Team" />

      {/* Add team member */}
      <div className="mt-6 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold mb-1">Add team member</h2>
        <p className="text-xs text-muted-foreground mb-4">
          Add their email address. When they sign in with Google using this email, they'll automatically join the team and see todos assigned to them.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="max-w-[200px]"
          />
          <Input
            placeholder="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            className="max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleAdd}
            disabled={!email.trim() || createUser.isPending}
          >
            <Plus size={14} />
            Add
          </Button>
        </div>
      </div>

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
              <span className="w-20">Status</span>
              <span className="w-10" />
            </div>
            {users.map((user) => {
              const isInvited = !user.googleId;
              const isSelf = session?.user?.id === user.id;

              return (
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
                  <div className="w-20">
                    {isInvited ? (
                      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                        Invited
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-600 border-0">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="w-10 flex justify-end">
                    {!isSelf && (
                      <button
                        type="button"
                        onClick={() => deleteUser.mutate(user.id)}
                        disabled={deleteUser.isPending}
                        className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove team member"
                      >
                        <Trash size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {users.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No team members yet. Add someone above to get started.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
