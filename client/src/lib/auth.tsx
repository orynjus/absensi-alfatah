import { createContext, useContext, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "./queryClient";
import { useLocation } from "wouter";

type User = {
  id: number;
  name: string;
  identifier: string;
  role: string;
  className: string | null;
  parentPhone: string | null;
  parentName: string | null;
  qrCode: string;
};

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  login: (data: { identifier: string; password: string; role: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<{ user: User } | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: async (loginData: { identifier: string; password: string; role: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", loginData);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
      const role = data.user.role;
      if (role === "admin") setLocation("/admin");
      else if (role === "siswa") setLocation("/siswa");
      else if (role === "guru") setLocation("/guru");
      else if (role === "wali_kelas") setLocation("/wali-kelas");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
      setLocation("/");
    },
  });

  const user = data?.user || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login: async (d) => { await loginMutation.mutateAsync(d); },
        logout: async () => { await logoutMutation.mutateAsync(); },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
