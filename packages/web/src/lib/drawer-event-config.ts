import {
  ArrowsClockwise,
  CalendarCheck,
  ChatCircleDots,
  CheckSquare,
  EnvelopeSimple,
  LinkedinLogo,
  MagnifyingGlass,
  NoteBlank,
  NotePencil,
  Plus,
  SignIn,
  VideoCamera,
} from "@phosphor-icons/react";
import type { DrawerTimelineEventType } from "./drawer-types";

export const timelineEventConfig: Record<
  DrawerTimelineEventType,
  { icon: React.ElementType; label: string; color: string }
> = {
  email: { icon: EnvelopeSimple, label: "Email", color: "bg-blue-100 text-blue-600" },
  meeting: { icon: VideoCamera, label: "Meeting", color: "bg-purple-100 text-purple-600" },
  meeting_notes: { icon: NotePencil, label: "Meeting Notes", color: "bg-purple-100 text-purple-600" },
  linkedin_message: { icon: LinkedinLogo, label: "LinkedIn", color: "bg-sky-100 text-sky-600" },
  linkedin_research: { icon: MagnifyingGlass, label: "LinkedIn Research", color: "bg-sky-100 text-sky-600" },
  internal_discussion: { icon: ChatCircleDots, label: "Internal", color: "bg-amber-100 text-amber-600" },
  calendar_event: { icon: CalendarCheck, label: "Calendar", color: "bg-green-100 text-green-600" },
  canvas_login: { icon: SignIn, label: "Canvas Login", color: "bg-emerald-100 text-emerald-600" },
  stage_change: { icon: ArrowsClockwise, label: "Stage Change", color: "bg-orange-100 text-orange-600" },
  note: { icon: NoteBlank, label: "Note", color: "bg-gray-100 text-gray-600" },
  task: { icon: CheckSquare, label: "Task", color: "bg-indigo-100 text-indigo-600" },
  contact_created: { icon: Plus, label: "Created", color: "bg-teal-100 text-teal-600" },
};
