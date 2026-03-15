import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Circle, Plus } from "@phosphor-icons/react";
import { useSession } from "@/hooks/use-auth";
import { useTasks, useCreateTask, useUpdateTask, useDeleteTask } from "@/hooks/use-tasks";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { dashboardRoute } from "./dashboard";

export const todosRoute = createRoute({
  getParentRoute: () => dashboardRoute,
  path: "/todos",
  component: TodosPage,
});

function TodosPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const { data: openData, isLoading: openLoading } = useTasks(
    userId ? { assigneeId: userId, completed: false } : undefined,
  );
  const { data: doneData, isLoading: doneLoading } = useTasks(
    userId ? { assigneeId: userId, completed: true } : undefined,
  );

  const openTasks = openData?.tasks ?? [];
  const doneTasks = doneData?.tasks ?? [];

  const updateTask = useUpdateTask();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();

  const [newTitle, setNewTitle] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  function handleAdd() {
    const title = newTitle.trim();
    if (!title || !userId) return;
    createTask.mutate({ title, assigneeId: userId, createdBy: userId });
    setNewTitle("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  }

  const isLoading = openLoading || doneLoading;

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <PageHeader title="My Todos" />

      {/* Quick add */}
      <div className="mt-6 flex gap-2">
        <Input
          placeholder="Add a new todo..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={!newTitle.trim() || createTask.isPending}
        >
          <Plus size={14} />
          Add
        </Button>
      </div>

      {/* Open tasks */}
      <div className="mt-6">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : openTasks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Circle size={32} className="mx-auto text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">No open todos</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add one above or have them assigned to you from a contact page.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {openTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => updateTask.mutate({ id: task.id, completed: true })}
                onDelete={() => deleteTask.mutate(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completed tasks */}
      {doneTasks.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setShowCompleted((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showCompleted ? "Hide" : "Show"} completed ({doneTasks.length})
          </button>

          {showCompleted && (
            <div className="mt-2 rounded-lg border border-border bg-card divide-y divide-border opacity-60">
              {doneTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onToggle={() => updateTask.mutate({ id: task.id, completed: false })}
                  onDelete={() => deleteTask.mutate(task.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: { id: string; title: string; completed: boolean; dueDate: string | null; contactId: string | null; companyId: string | null };
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isOverdue = task.dueDate && !task.completed && new Date(task.dueDate) < new Date();

  return (
    <div className="group flex items-start gap-3 px-4 py-3">
      <button
        type="button"
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
          task.completed
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input hover:border-primary",
        )}
        onClick={onToggle}
      >
        {task.completed && <Check size={10} weight="bold" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", task.completed && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        {task.dueDate && (
          <p className={cn("mt-0.5 text-[11px]", isOverdue ? "text-destructive" : "text-muted-foreground")}>
            Due {new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-destructive transition-colors text-xs"
      >
        Delete
      </button>
    </div>
  );
}
