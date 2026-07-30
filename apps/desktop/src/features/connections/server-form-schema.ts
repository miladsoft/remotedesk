import { z } from "zod";

export const serverFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  hostname: z.string().trim().min(1, "Hostname is required"),
  port: z.coerce.number().int().min(1).max(65535),
  protocol: z.enum(["ssh", "sftp", "rdp", "vnc", "local_shell", "custom_command"]),
  username: z.string().trim().optional(),
  authenticationType: z.enum(["password", "private_key", "agent"]),
  secret: z.string().optional(),
  privateKeyPath: z.string().trim().optional(),
  workingDirectory: z.string().trim().optional(),
  groupId: z.string().optional(),
  isFavorite: z.boolean(),
  tagIds: z.array(z.string()),
});

export type ServerFormValues = z.infer<typeof serverFormSchema>;

export const defaultServerFormValues: ServerFormValues = {
  name: "",
  description: "",
  hostname: "",
  port: 22,
  protocol: "ssh",
  username: "",
  authenticationType: "password",
  secret: "",
  privateKeyPath: "",
  workingDirectory: "",
  groupId: undefined,
  isFavorite: false,
  tagIds: [],
};
