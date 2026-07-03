import { api } from "../app/api.js";
import type { User } from "../types.js";

export type LoginInput = {
  email: string;
  password: string;
};

export async function loadCurrentUser(): Promise<User> {
  const response = await api<{ user: User }>("/api/auth/me");
  return response.user;
}

export async function login(input: LoginInput): Promise<User> {
  const response = await api<{ user: User }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return response.user;
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}
