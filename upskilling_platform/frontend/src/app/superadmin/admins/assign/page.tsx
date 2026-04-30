"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { routes } from "@/app/lib/routes";
import { getUsers, getTenants, createAdminDirect, TenantResponse, UserResponse, IDENTITY_URL } from "@/app/lib/api";
import { Input } from "@/app/components/ui/Input";

interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  tenant_id?: string;
}

export default function AssignAdminPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedTenant, setSelectedTenant] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
   // New user creation state
   const [showCreateUser, setShowCreateUser] = useState(false);
   const [newUser, setNewUser] = useState({
     first_name: "",
     last_name: "",
     email: "",
     password: "",
   });
   const [creatingUser, setCreatingUser] = useState(false);
   const [detectedTenant, setDetectedTenant] = useState<TenantResponse | null>(null);
   const [createdCredentials, setCreatedCredentials] = useState<{email: string, password: string} | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const usersData = await getUsers(1, 100);
      const tenantsData = await getTenants(1, 50);
      setUsers(usersData.users || []);
      setTenants(tenantsData.tenants || []);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function refreshTenants() {
    try {
      const tenantsData = await getTenants(1, 50);
      setTenants(tenantsData.tenants || []);
    } catch (error) {
      console.error("Failed to refresh tenants:", error);
    }
  }

  async function handleCreateUser() {
    if (!newUser.first_name || !newUser.last_name || !newUser.email || !newUser.password) {
      setMessage({ type: "error", text: "Please fill in all required fields" });
      return;
    }

    // Auto-detect tenant based on email domain
    const emailDomain = newUser.email.split('@')[1]?.toLowerCase();

    const matchedTenant = tenants.find(t =>
      t.email_domain && t.email_domain.toLowerCase() === emailDomain
    );

    if (!matchedTenant) {
      setMessage({
        type: "error",
        text: `Could not detect company based on email domain "${emailDomain}". Please check that a company has this domain configured. Available domains: ${tenants.filter(t => t.email_domain).map(t => t.email_domain).join(', ') || 'none configured'}`
      });
      return;
    }

    setCreatingUser(true);
    setMessage(null);

    try {
      const response = await createAdminDirect({
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        email: newUser.email,
        password: newUser.password,
        tenant_id: matchedTenant.id,
      });

      setCreatedCredentials(response.login_credentials);

      // Re-fetch the users list to ensure we have the latest data
      const updatedUsersData = await getUsers(1, 100);
      setUsers(updatedUsersData.users || []);

      setShowCreateUser(false);
      setNewUser({ first_name: "", last_name: "", email: "", password: "" });
      setMessage({ type: "success", text: `Admin created successfully for ${matchedTenant.name}!` });
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to create admin" });
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleAssign() {
    if (!selectedUser || !selectedTenant) {
      setMessage({ type: "error", text: "Please select both a user and a company" });
      return;
    }

    setAssigning(true);
    setMessage(null);

    try {
      const token = localStorage.getItem("access_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      const response = await fetch(`${IDENTITY_URL}/api/v1/superadmin/admins/assign`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: selectedUser,
          tenant_id: selectedTenant,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || "Failed to assign admin");
      }

      setMessage({ type: "success", text: "Admin assigned successfully!" });
      setSelectedUser("");
      setSelectedTenant("");
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to assign admin" });
    } finally {
      setAssigning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F1117]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  const availableUsers = users.filter(u => u.role !== "Admin" && u.role !== "SuperAdmin");

  return (
    <div className="min-h-screen bg-[#0F1117] p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Link href={routes.superadmin} className="text-gray-400 hover:text-white text-sm mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-white">Admin Management</h1>
          <p className="text-gray-400 mt-1">Assign an existing user or create a new admin directly with login credentials</p>
        </div>

        <div className="bg-[#1A1D27] rounded-2xl border border-[#2A2D3E] p-6">
          <div className="flex justify-between items-center mb-6">
            <div></div>
            <button
              onClick={refreshTenants}
              className="text-[#6C63FF] hover:text-white text-sm"
            >
              🔄 Refresh Companies
            </button>
          </div>

          {message && (
            <div className={`mb-6 p-4 rounded-lg ${
              message.type === "success"
                ? "bg-[#00D4AA]/20 border border-[#00D4AA]/40 text-[#00D4AA]"
                : "bg-[#FF6B6B]/20 border border-[#FF6B6B]/40 text-[#FF6B6B]"
            }`}>
              {message.text}
            </div>
          )}

          {createdCredentials && (
            <div className="mb-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
              <h3 className="text-green-400 font-semibold mb-2">Admin Created Successfully!</h3>
              <div className="text-white space-y-1">
                <div><strong>Email:</strong> {createdCredentials.email}</div>
                <div><strong>Password:</strong> {createdCredentials.password}</div>
              </div>
              <div className="text-gray-400 text-sm mt-2">
                The admin can now log in using these credentials at /login
              </div>
              <button
                onClick={() => setCreatedCredentials(null)}
                className="mt-3 px-3 py-1 rounded text-sm bg-gray-600 hover:bg-gray-500"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="space-y-6">
            {/* Create New Admin Section */}
            {!showCreateUser ? (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Create a new admin with login credentials</span>
                <button
                  onClick={() => setShowCreateUser(true)}
                  className="text-[#6C63FF] hover:text-white text-sm font-medium"
                >
                  + Create New Admin
                </button>
              </div>
            ) : (
              <div className="border border-[#2A2D3E] rounded-lg p-4 bg-[#0F1117]">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-white font-medium">Create New Admin</h3>
                  <button
                    onClick={() => { setShowCreateUser(false); setNewUser({ first_name: "", last_name: "", email: "", password: "" }); setDetectedTenant(null); }}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    Cancel
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">First Name *</label>
                    <input
                      type="text"
                      value={newUser.first_name}
                      onChange={(e) => setNewUser({ ...newUser, first_name: e.target.value })}
                      className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Last Name *</label>
                    <input
                      type="text"
                      value={newUser.last_name}
                      onChange={(e) => setNewUser({ ...newUser, last_name: e.target.value })}
                      className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white"
                      placeholder="Doe"
                    />
                  </div>
                </div>
                
                <div className="mt-4">
                  <label className="block text-sm text-gray-400 mb-1">Email *</label>
                  <input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white"
                    placeholder="john@globalnet.tn"
                  />
                  <p className="text-xs text-gray-500 mt-1">Company will be detected automatically and admin will be created for that company</p>
                </div>

                <div className="mt-4">
                  <label className="block text-sm text-gray-400 mb-1">Password *</label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white"
                    placeholder="Enter a secure password"
                  />
                  <p className="text-xs text-gray-500 mt-1">Minimum 8 characters required</p>
                </div>

                {detectedTenant && (
                  <div className="mt-3 p-2 bg-[#00D4AA]/20 border border-[#00D4AA]/40 rounded-lg text-[#00D4AA] text-sm">
                    ✓ Detected company: {detectedTenant.name}
                  </div>
                )}
                
                <button
                  onClick={handleCreateUser}
                  disabled={creatingUser || !newUser.first_name || !newUser.last_name || !newUser.email || !newUser.password}
                  className="w-full mt-4 py-2 bg-[#6C63FF] text-white rounded-lg font-medium hover:bg-[#5a52d4] disabled:opacity-50 transition-colors"
                >
                  {creatingUser ? "Creating..." : "Create Admin"}
                </button>
              </div>
            )}

            {/* Select User */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Select User *</label>
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2.5 text-white"
              >
                <option value="">Select a user</option>
                {availableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name} ({user.email}) - {user.role}
                  </option>
                ))}
              </select>
              {availableUsers.length === 0 && (
                <p className="text-xs text-yellow-500 mt-1">No users available. Create a new user first.</p>
              )}
            </div>

            {/* Select Company */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Select Company *</label>
              <select
                value={selectedTenant}
                onChange={(e) => setSelectedTenant(e.target.value)}
                className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2.5 text-white"
              >
                <option value="">Select a company</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleAssign}
              disabled={assigning || !selectedUser || !selectedTenant}
              className="w-full py-3 bg-[#6C63FF] text-white rounded-lg font-medium hover:bg-[#5a52d4] disabled:opacity-50 transition-colors"
            >
              {assigning ? "Assigning..." : "Assign as Admin"}
            </button>
          </div>
        </div>

        {users.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-bold text-white mb-4">Current Users</h2>
            <div className="bg-[#1A1D27] rounded-2xl border border-[#2A2D3E] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2A2D3E]">
                    <th className="text-left text-gray-400 px-6 py-4">Name</th>
                    <th className="text-left text-gray-400 px-6 py-4">Email</th>
                    <th className="text-left text-gray-400 px-6 py-4">Role</th>
                    <th className="text-left text-gray-400 px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {users.slice(0, 10).map((user) => (
                    <tr key={user.id} className="border-b border-[#2A2D3E]">
                      <td className="px-6 py-4 text-white">
                        {user.first_name} {user.last_name}
                      </td>
                      <td className="px-6 py-4 text-gray-300">{user.email}</td>
                      <td className="px-6 py-4 text-gray-300">{user.role}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          user.status === "active" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
