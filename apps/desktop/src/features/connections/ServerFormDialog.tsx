import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { Server, ServerInput } from "@remotedesk/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useServerStore } from "@/stores/useServerStore";
import { errorMessage } from "@/lib/tauri";
import {
  defaultServerFormValues,
  serverFormSchema,
  type ServerFormValues,
} from "./server-form-schema";

function toFormValues(server: Server): ServerFormValues {
  return {
    name: server.name,
    description: server.description ?? "",
    hostname: server.hostname,
    port: server.port,
    protocol: server.protocol,
    username: server.username ?? "",
    authenticationType: server.authenticationType,
    secret: "",
    privateKeyPath: server.privateKeyPath ?? "",
    workingDirectory: server.workingDirectory ?? "",
    groupId: server.groupId ?? undefined,
    isFavorite: server.isFavorite,
    tagIds: server.tagIds,
  };
}

function toServerInput(values: ServerFormValues): ServerInput {
  return {
    name: values.name.trim(),
    description: values.description?.trim() || null,
    hostname: values.hostname.trim(),
    port: values.port,
    protocol: values.protocol,
    username: values.username?.trim() || null,
    authenticationType: values.authenticationType,
    secret: values.secret ? values.secret : null,
    privateKeyPath: values.privateKeyPath?.trim() || null,
    groupId: values.groupId || null,
    jumpServerId: null,
    workingDirectory: values.workingDirectory?.trim() || null,
    terminalProfileId: null,
    isFavorite: values.isFavorite,
    tagIds: values.tagIds,
  };
}

interface ServerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present when editing an existing server; absent when creating one. */
  server?: Server;
}

export function ServerFormDialog({ open, onOpenChange, server }: ServerFormDialogProps) {
  const groups = useServerStore((s) => s.groups);
  const tags = useServerStore((s) => s.tags);
  const createServer = useServerStore((s) => s.createServer);
  const updateServer = useServerStore((s) => s.updateServer);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ServerFormValues>({
    resolver: zodResolver(serverFormSchema),
    defaultValues: server ? toFormValues(server) : defaultServerFormValues,
  });

  useEffect(() => {
    if (open) {
      reset(server ? toFormValues(server) : defaultServerFormValues);
      setSubmitError(null);
    }
  }, [open, server, reset]);

  const authenticationType = watch("authenticationType");

  async function onSubmit(values: ServerFormValues) {
    setSubmitError(null);
    try {
      const input = toServerInput(values);
      if (server) {
        await updateServer(server.id, input);
      } else {
        await createServer(input);
      }
      onOpenChange(false);
    } catch (err) {
      setSubmitError(errorMessage(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <DialogHeader className="shrink-0 border-b p-4">
            <DialogTitle>{server ? "Edit Connection" : "New Connection"}</DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            <DialogDescription>
              Passwords and passphrases are stored in your OS keychain, never in the database.
            </DialogDescription>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" {...register("name")} autoFocus />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" rows={2} {...register("description")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hostname">Hostname / IP</Label>
              <Input id="hostname" {...register("hostname")} placeholder="10.0.0.20" />
              {errors.hostname && (
                <p className="text-xs text-destructive">{errors.hostname.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="port">Port</Label>
              <Input id="port" type="number" {...register("port")} />
              {errors.port && <p className="text-xs text-destructive">{errors.port.message}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Protocol</Label>
              <Controller
                control={control}
                name="protocol"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssh">SSH</SelectItem>
                      <SelectItem value="sftp">SFTP</SelectItem>
                      <SelectItem value="rdp">RDP</SelectItem>
                      <SelectItem value="vnc">VNC</SelectItem>
                      <SelectItem value="local_shell">Local shell</SelectItem>
                      <SelectItem value="custom_command">Custom command</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" {...register("username")} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Authentication</Label>
              <Controller
                control={control}
                name="authenticationType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="password">Password</SelectItem>
                      <SelectItem value="private_key">Private key</SelectItem>
                      <SelectItem value="agent">SSH agent</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            {authenticationType !== "agent" && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="secret">
                  {authenticationType === "private_key" ? "Key passphrase" : "Password"}
                  {server && <span className="text-muted-foreground"> (leave blank to keep unchanged)</span>}
                </Label>
                <Input id="secret" type="password" {...register("secret")} />
              </div>
            )}

            {authenticationType === "private_key" && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="privateKeyPath">Private key path</Label>
                <Input
                  id="privateKeyPath"
                  {...register("privateKeyPath")}
                  placeholder="~/.ssh/id_ed25519"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label>Group</Label>
              <Controller
                control={control}
                name="groupId"
                render={({ field }) => (
                  <Select
                    value={field.value ?? "none"}
                    onValueChange={(value) => field.onChange(value === "none" ? undefined : value)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No group</SelectItem>
                      {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workingDirectory">Working directory</Label>
              <Input id="workingDirectory" {...register("workingDirectory")} />
            </div>

            {tags.length > 0 && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Tags</Label>
                <Controller
                  control={control}
                  name="tagIds"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-3">
                      {tags.map((tag) => {
                        const checked = field.value.includes(tag.id);
                        return (
                          <label
                            key={tag.id}
                            className="flex items-center gap-1.5 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => {
                                field.onChange(
                                  value
                                    ? [...field.value, tag.id]
                                    : field.value.filter((id) => id !== tag.id),
                                );
                              }}
                            />
                            {tag.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
              </div>
            )}

            <div className="col-span-2 flex items-center gap-2">
              <Controller
                control={control}
                name="isFavorite"
                render={({ field }) => (
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} id="isFavorite" />
                )}
              />
              <Label htmlFor="isFavorite">Mark as favorite</Label>
            </div>
          </div>

          {submitError && <p className="mt-4 text-sm text-destructive">{submitError}</p>}
          </div>

          <DialogFooter className="mx-0 mb-0 shrink-0 border-t bg-muted/50 p-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {server ? "Save changes" : "Create connection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
