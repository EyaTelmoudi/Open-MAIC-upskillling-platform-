'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/app/context/AuthContext';
import { AdminShell } from '@/app/components/layout/AdminShell';
import { Button } from '@/app/components/ui/Button';
import { Input } from '@/app/components/ui/Input';
import { Select } from '@/app/components/ui/Select';
import { Badge } from '@/app/components/ui/Badge';
import { api } from '@/app/lib/api';
import { routes } from '@/app/lib/routes';
import {
  DEFAULT_DEPARTMENTS,
  addDepartmentForTenant,
  getDepartmentsForTenant,
} from '@/app/lib/departments';
import { formatDateForUser, formatDateOnlyForUser } from '@/app/lib/user-date-format';
import {
  Users,
  UserPlus,
  Mail,
  Shield,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  ChevronLeft,
  ChevronRight,
  X,
  Building2,
  BookOpen,
  Download,
  MoreHorizontal,
  GraduationCap,
  Calendar,
  RefreshCw,
  Eye,
  Trash2,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { UsersAdministrationHero } from './UsersAdministrationHero';
import { UsersManagementNav } from './UsersManagementNav';

interface UserItem {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar: string | null;
  role: string;
  status: string;
  department: string | null;
  created_at: string;
  last_login: string | null;
  bio: string | null;
  lastLogin: string;
  progress: { completed: number; total: number };
  courses: CourseStatus[];
}

interface InviteForm {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  department: string;
  password: string;
}

interface CourseStatus {
  name: string;
  status: 'Done' | 'In progress' | 'Not started';
}

interface UsersResponse {
  users: UserItem[];
  total: number;
}

const INITIAL_INVITE_FORM: InviteForm = {
  first_name: '',
  last_name: '',
  email: '',
  role: 'TeamMember',
  department: DEFAULT_DEPARTMENTS[0],
  password: '',
};

const roles = ['Admin', 'Manager', 'TeamManager', 'TeamMember', 'TeamIntern', 'LearningExpert'];
const ADMIN_USERS_ALLOWED_ROLES = new Set(['Admin']);
const statuses = ['Active', 'Pending', 'Inactive'];
const inviteFieldClassName =
  'h-11 border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100';
const inviteSelectClassName =
  'h-11 border-slate-300 bg-white text-slate-950 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100';
const roleColors: Record<string, { bg: string; text: string }> = {
  Admin: { bg: 'bg-purple-500/10', text: 'text-purple-500' },
  Manager: { bg: 'bg-purple-500/10', text: 'text-purple-500' },
  Trainer: { bg: 'bg-blue-500/10', text: 'text-blue-500' },
  Student: { bg: 'bg-gray-500/10', text: 'text-gray-500' },
  TeamMember: { bg: 'bg-gray-500/10', text: 'text-gray-500' },
  default: { bg: 'bg-gray-500/10', text: 'text-gray-500' },
};

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  active: { bg: 'bg-green-500/10', text: 'text-green-500', icon: CheckCircle },
  provisioned: { bg: 'bg-blue-500/10', text: 'text-blue-500', icon: CheckCircle },
  pending_invitation: { bg: 'bg-amber-500/10', text: 'text-amber-500', icon: Clock },
  pending: { bg: 'bg-amber-500/10', text: 'text-amber-500', icon: Clock },
  inactive: { bg: 'bg-gray-500/10', text: 'text-gray-500', icon: XCircle },
  suspended: { bg: 'bg-gray-500/10', text: 'text-gray-500', icon: XCircle },
};

const apiStatusMap: Record<string, string> = {
  active: 'Active',
  provisioned: 'Provisioned',
  pending_invitation: 'Pending',
  pending: 'Pending',
  inactive: 'Inactive',
  suspended: 'Inactive',
};

const exampleUsers: (UserItem & {
  lastLogin: string;
  progress: { completed: number; total: number };
  courses: CourseStatus[];
})[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'sarah.chen@techcorp.com',
    first_name: 'Sarah',
    last_name: 'Chen',
    avatar: null,
    role: 'Trainer',
    status: 'Active',
    department: 'Tech',
    created_at: '2025-06-15',
    last_login: '2026-04-02',
    lastLogin: '2 hours ago',
    bio: 'Senior Software Engineer',
    progress: { completed: 3, total: 5 },
    courses: [
      { name: 'Intro to AI tools', status: 'Done' },
      { name: 'Data literacy', status: 'Done' },
      { name: 'Prompt engineering', status: 'Done' },
      { name: 'Python basics', status: 'In progress' },
      { name: 'Security awareness', status: 'Not started' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'michael.roberts@techcorp.com',
    first_name: 'Michael',
    last_name: 'Roberts',
    avatar: null,
    role: 'Student',
    status: 'Active',
    department: 'Marketing',
    created_at: '2025-09-10',
    last_login: '2026-04-01',
    lastLogin: '1 day ago',
    bio: 'Marketing Specialist',
    progress: { completed: 1, total: 4 },
    courses: [
      { name: 'Intro to AI tools', status: 'Done' },
      { name: 'Data literacy', status: 'In progress' },
      { name: 'Prompt engineering', status: 'Not started' },
      { name: 'Security awareness', status: 'Not started' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'emma.wilson@techcorp.com',
    first_name: 'Emma',
    last_name: 'Wilson',
    avatar: null,
    role: 'Student',
    status: 'Pending',
    department: 'HR',
    created_at: '2026-03-28',
    last_login: null,
    lastLogin: 'Never',
    bio: 'HR Coordinator',
    progress: { completed: 0, total: 3 },
    courses: [
      { name: 'Intro to AI tools', status: 'Not started' },
      { name: 'Data literacy', status: 'Not started' },
      { name: 'Security awareness', status: 'Not started' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'james.kim@techcorp.com',
    first_name: 'James',
    last_name: 'Kim',
    avatar: null,
    role: 'Admin',
    status: 'Active',
    department: 'Tech',
    created_at: '2025-01-05',
    last_login: '2026-04-02',
    lastLogin: '3 hours ago',
    bio: 'Platform Administrator',
    progress: { completed: 5, total: 5 },
    courses: [
      { name: 'Intro to AI tools', status: 'Done' },
      { name: 'Data literacy', status: 'Done' },
      { name: 'Prompt engineering', status: 'Done' },
      { name: 'Python basics', status: 'Done' },
      { name: 'Security awareness', status: 'Done' },
    ],
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'lisa.johnson@techcorp.com',
    first_name: 'Lisa',
    last_name: 'Johnson',
    avatar: null,
    role: 'Student',
    status: 'Inactive',
    department: 'Finance',
    created_at: '2025-08-20',
    last_login: '2026-03-01',
    lastLogin: '32 days ago',
    bio: 'Financial Analyst',
    progress: { completed: 2, total: 4 },
    courses: [
      { name: 'Intro to AI tools', status: 'Done' },
      { name: 'Data literacy', status: 'Done' },
      { name: 'Prompt engineering', status: 'Not started' },
      { name: 'Security awareness', status: 'Not started' },
    ],
  },
];

export default function AdminUsersPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showInvite, setShowInvite] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(null);
  const [filters, setFilters] = useState({ department: 'All', role: 'All', status: 'All' });

  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [showAssignCourseModal, setShowAssignCourseModal] = useState(false);
  const [showResetProgressModal, setShowResetProgressModal] = useState(false);
  const [showLoginHistoryModal, setShowLoginHistoryModal] = useState(false);
  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [loginHistory, setLoginHistory] = useState<{ timestamp: string; type: string }[]>([]);
  const [availableCourses, setAvailableCourses] = useState<{ id: string; title: string }[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [showAddEditDepartment, setShowAddEditDepartment] = useState(false);
  const [newEditDepartmentName, setNewEditDepartmentName] = useState('');

  const [newRole, setNewRole] = useState('');
  const [newDept, setNewDept] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');

  const [actionLoading, setActionLoading] = useState(false);

  const [inviteForm, setInviteForm] = useState<InviteForm>(INITIAL_INVITE_FORM);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    success_count: number;
    provisioned_count: number;
    pending_count: number;
    skipped_count: number;
    errors: { row: number; error: string; email: string }[];
  } | null>(null);

  const mapUsersForDisplay = useCallback((response: UsersResponse | { items?: UserItem[] }) => {
    const data = 'users' in response ? response.users : response.items || [];
    return data.map((u) => ({
      ...u,
      lastLogin: u.last_login ? formatDateForUser(u.last_login, user?.timezone) : 'Never',
      progress: { completed: 0, total: 0 },
      courses: [],
    }));
  }, [user?.timezone]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setImportResult(null);
    }
  };

  const handleDownloadImportTemplate = () => {
    const csvContent = [
      'email,first_name,last_name,role,department',
      'test.user01@example.com,Test,User01,TeamMember,Engineering',
      'test.user02@example.com,Test,User02,Manager,Sales',
      'test.user03@example.com,Test,User03,LearningExpert,Product',
      'test.user04@example.com,Test,User04,TeamManager,Marketing',
      'test.user05@example.com,Test,User05,TeamIntern,Engineering',
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'user_import_template.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!selectedFile) return;
    setIsImporting(true);
    setError('');
    setSuccess('');
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await api.postForm<{
        provisioned_count: number;
        pending_count: number;
        skipped_count: number;
        errors: { row: number; error: string; email: string }[];
      }>('/api/v1/identity/users/import', formData);

      setImportResult({
        success_count: response.provisioned_count + response.pending_count,
        provisioned_count: response.provisioned_count,
        pending_count: response.pending_count,
        skipped_count: response.skipped_count,
        errors: response.errors,
      });

      const usersResponse = await api.get<UsersResponse>(
        '/api/v1/identity/users/?page=1&page_size=100',
      );
      setUsers(mapUsersForDisplay(usersResponse));
      setSuccess('CSV import completed.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExport = async (format: string = 'xlsx') => {
    setIsExporting(true);
    setError('');
    try {
      const params = new URLSearchParams({ format });
      if (filters.role !== 'All') {
        params.set('role', filters.role);
      }
      if (filters.department !== 'All') {
        params.set('department', filters.department);
      }
      if (filters.status !== 'All') {
        params.set('status', filters.status.toLowerCase());
      }

      const blob = await api.getBlob(
        `/api/v1/identity/users/_legacy/export?${params.toString()}`,
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `company-users.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      setSuccess(`Users exported as ${format === 'xlsx' ? 'Excel' : format.toUpperCase()}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const loadUsersFn = useCallback(async () => {
    if (isAuthLoading || !user || !ADMIN_USERS_ALLOWED_ROLES.has(user.role)) {
      return;
    }
    setIsLoading(true);
    try {
      const response = await api.get<UsersResponse>('/api/v1/identity/users/?page=1&page_size=100');
      setUsers(mapUsersForDisplay(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthLoading, mapUsersForDisplay, user]);

  useEffect(() => {
    if (!isAuthLoading && user && ADMIN_USERS_ALLOWED_ROLES.has(user.role)) {
      loadUsersFn();
    }
  }, [isAuthLoading, loadUsersFn, user]);

  useEffect(() => {
    setDepartmentOptions(
      getDepartmentsForTenant(
        user?.tenant_id,
        users.map((listedUser) => listedUser.department),
      ),
    );
  }, [user?.tenant_id, users]);

  const metrics = useMemo(() => {
    const total = users.length;
    const active = users.filter((u) => u.status === 'active').length;
    const pending = users.filter(
      (u) => u.status === 'pending_invitation' || u.status === 'pending',
    ).length;
    const inactive = users.filter(
      (u) => u.status === 'inactive' || u.status === 'suspended',
    ).length;
    return { total, active: active || total, pending, inactive };
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const q = search.toLowerCase();
      const name = `${u.first_name} ${u.last_name}`.toLowerCase();
      const matchesSearch =
        !q ||
        name.includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q);
      const matchesDept = filters.department === 'All' || u.department === filters.department;
      const matchesRole = filters.role === 'All' || u.role === filters.role;
      const matchesStatus = filters.status === 'All' || apiStatusMap[u.status] === filters.status;
      return matchesSearch && matchesDept && matchesRole && matchesStatus;
    });
  }, [users, search, filters]);

  const activeFilterCount = useMemo(() => {
    return [
      search.trim() ? 1 : 0,
      filters.department !== 'All' ? 1 : 0,
      filters.role !== 'All' ? 1 : 0,
      filters.status !== 'All' ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0);
  }, [search, filters]);

  const handleSelectUser = (userId: string, checked: boolean) => {
    const newSet = new Set(selectedUsers);
    if (checked) {
      newSet.add(userId);
    } else {
      newSet.delete(userId);
    }
    setSelectedUsers(newSet);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedUsers(new Set(filteredUsers.map((u) => u.id)));
    } else {
      setSelectedUsers(new Set());
    }
  };

  const resetInviteModal = () => {
    setInviteForm({
      ...INITIAL_INVITE_FORM,
      department: departmentOptions[0] || DEFAULT_DEPARTMENTS[0],
    });
    setNewDepartmentName('');
    setShowAddDepartment(false);
  };

  const openInviteModal = () => {
    resetInviteModal();
    setShowInvite(true);
  };

  const closeInviteModal = () => {
    setShowInvite(false);
    resetInviteModal();
  };

  const handleInvite = async () => {
    setError('');
    setSuccess('');
    if (!inviteForm.first_name.trim() || !inviteForm.last_name.trim() || !inviteForm.email.trim()) {
      setError('First name, last name, and email are required');
      return;
    }
    setIsInviting(true);
    try {
      const createdUser = await api.post<UserItem>('/api/v1/identity/users/invite', {
        first_name: inviteForm.first_name.trim(),
        last_name: inviteForm.last_name.trim(),
        email: inviteForm.email.trim(),
        role: inviteForm.role,
        department: inviteForm.department || DEFAULT_DEPARTMENTS[0],
        password: inviteForm.password || undefined,
      });
      if (inviteForm.password) {
        await api.post(`/api/v1/identity/users/${createdUser.id}/set-local-password`, {
          password: inviteForm.password,
        });
      }
      closeInviteModal();
      setSuccess('User added successfully!');

      // Refresh users list
      const response = await api.get<UsersResponse>('/api/v1/identity/users/?page=1&page_size=100');
      setUsers(mapUsersForDisplay(response));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user');
    } finally {
      setIsInviting(false);
    }
  };

  const handleAddDepartment = () => {
    const nextDepartments = addDepartmentForTenant(user?.tenant_id, newDepartmentName);
    if (!newDepartmentName.trim()) {
      return;
    }

    setDepartmentOptions(nextDepartments);
    setInviteForm((current) => ({ ...current, department: newDepartmentName.trim() }));
    setNewDepartmentName('');
    setShowAddDepartment(false);
  };

  const handleAddDepartmentForEdit = () => {
    const nextDepartments = addDepartmentForTenant(user?.tenant_id, newEditDepartmentName);
    if (!newEditDepartmentName.trim()) {
      return;
    }

    setDepartmentOptions(nextDepartments);
    setNewDept(newEditDepartmentName.trim());
    setNewEditDepartmentName('');
    setShowAddEditDepartment(false);
  };

  const handleBulkAction = (action: string) => {
    setSuccess(`${action} applied to ${selectedUsers.size} user(s)`);
    setSelectedUsers(new Set());
    setTimeout(() => setSuccess(''), 3000);
  };

  const fetchCourses = useCallback(async () => {
    try {
      const data = await api.get<{ items: { id: string; title: string }[]; total: number }>(
        '/api/v1/learning/courses/',
      );
      setAvailableCourses(Array.isArray(data?.items) ? data.items : []);
    } catch {
      setAvailableCourses([]);
    }
  }, []);

  const fetchLoginHistory = useCallback(async (userId: string) => {
    try {
      const data = await api.get<{ timestamp: string; type: string }[]>(
        `/api/v1/identity/users/${userId}/login-history`,
      );
      setLoginHistory(Array.isArray(data) ? data : []);
      setShowLoginHistoryModal(true);
    } catch (err) {
      console.error('Login history error:', err);
      setError(
        'Cannot fetch login history: ' +
          (err instanceof Error ? err.message : 'User may not exist in database'),
      );
    }
  }, []);

  const handleChangeRole = async () => {
    if (!selectedUser || !newRole) return;
    setActionLoading(true);
    try {
      await api.put(`/api/v1/identity/users/${selectedUser.id}`, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === selectedUser.id ? { ...u, role: newRole } : u)));
      if (selectedUser.id === selectedUser.id) {
        setSelectedUser({ ...selectedUser, role: newRole });
      }
      setSuccess('Role updated successfully!');
      setShowRoleModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeDepartment = async () => {
    if (!selectedUser || !newDept) return;
    setActionLoading(true);
    try {
      await api.put(`/api/v1/identity/users/${selectedUser.id}`, { department: newDept });
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, department: newDept } : u)),
      );
      if (selectedUser.id === selectedUser.id) {
        setSelectedUser({ ...selectedUser, department: newDept });
      }
      setSuccess('Department updated successfully!');
      setShowDeptModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update department');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssignCourse = async () => {
    if (!selectedUser || !selectedCourseId) return;
    setActionLoading(true);
    try {
      await api.post('/api/v1/learning/enrollments/', {
        user_id: selectedUser.id,
        course_id: selectedCourseId,
      });
      setSuccess('Course assigned successfully!');
      setShowAssignCourseModal(false);
      setSelectedCourseId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign course');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetProgress = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.delete(`/api/v1/learning/progress/user/${selectedUser.id}/reset`);
      setSuccess('Progress reset successfully!');
      setShowResetProgressModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset progress');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResendInvite = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.post(`/api/v1/identity/users/${selectedUser.id}/resend-invite`, {});
      setSuccess('Invitation resent successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resend invite');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!selectedUser) return;
    setActionLoading(true);
    try {
      await api.post(`/api/v1/identity/users/${selectedUser.id}/deactivate`, {});
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUser.id ? { ...u, status: 'Inactive' } : u)),
      );
      setSuccess('User deactivated successfully!');
      setShowDeactivateModal(false);
      setSelectedUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user');
    } finally {
      setActionLoading(false);
    }
  };

  if (!user || !ADMIN_USERS_ALLOWED_ROLES.has(user.role)) {
    return (
      <AdminShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-slate-400" />
            <h2 className="mt-4 text-xl font-semibold text-slate-950">Access Denied</h2>
            <p className="mt-2 text-slate-600">This page is only accessible to admins.</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <UsersManagementNav />

        <UsersAdministrationHero />

        <section className="overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">User actions</p>
                <p className="text-xs text-slate-500">
                  Import, export, or create users without leaving the company directory.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowImport(true)}
                  className="border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-950"
                >
                  <Upload className="h-4 w-4" />
                  Import CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleExport()}
                  disabled={isExporting}
                  className="border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-950"
                >
                  <Download className="h-4 w-4" />
                  {isExporting ? 'Exporting...' : 'Export Excel'}
                </Button>
                <Button onClick={openInviteModal} className="shadow-sm">
                  <UserPlus className="h-4 w-4" />
                  Add User
                </Button>
              </div>
            </div>

            {success && (
              <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-white/85 p-3 text-sm font-medium text-emerald-800 shadow-sm">
                <CheckCircle className="h-4 w-4" />
                {success}
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-white/85 p-3 text-sm font-medium text-rose-700 shadow-sm">
                <AlertTriangle className="h-4 w-4" />
                {error}
              </div>
            )}

            {/* Metric Cards */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100">
                    <Users className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-950">{metrics.total}</p>
                    <p className="text-xs font-medium text-slate-500">Total users</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100">
                    <CheckCircle className="h-5 w-5 text-emerald-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-950">{metrics.active}</p>
                    <p className="text-xs font-medium text-slate-500">Active users</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100">
                    <Clock className="h-5 w-5 text-amber-700" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-950">{metrics.pending}</p>
                    <p className="text-xs font-medium text-slate-500">Pending invites</p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
                    <XCircle className="h-5 w-5 text-slate-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-950">{metrics.inactive}</p>
                    <p className="text-xs font-medium text-slate-500">Inactive users</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div className="rounded-3xl border border-white/80 bg-white/90 p-4 shadow-sm backdrop-blur">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">Search and filter</p>
                      <p className="text-xs text-slate-500">
                        Narrow the company directory by user identity, department, role, or status.
                      </p>
                    </div>
                    {activeFilterCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700"
                      >
                        {activeFilterCount} active
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(260px,1.6fr)_minmax(150px,1fr)_minmax(140px,1fr)_minmax(140px,1fr)]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by name or email"
                        className="h-11 border-slate-200 bg-white pl-10 text-slate-900 shadow-sm placeholder:text-slate-400"
                      />
                    </div>
                    <Select
                      options={[
                        { value: 'All', label: 'All departments' },
                        ...departmentOptions.map((d) => ({ value: d, label: d })),
                      ]}
                      value={filters.department}
                      onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
                      className="h-11 w-full border-slate-200 bg-white text-slate-900 shadow-sm"
                    />
                    <Select
                      options={[
                        { value: 'All', label: 'All roles' },
                        ...roles.map((r) => ({ value: r, label: r })),
                      ]}
                      value={filters.role}
                      onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
                      className="h-11 w-full border-slate-200 bg-white text-slate-900 shadow-sm"
                    />
                    <Select
                      options={[
                        { value: 'All', label: 'All statuses' },
                        ...statuses.map((s) => ({ value: s, label: s })),
                      ]}
                      value={filters.status}
                      onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                      className="h-11 w-full border-slate-200 bg-white text-slate-900 shadow-sm"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearch('');
                      setFilters({ department: 'All', role: 'All', status: 'All' });
                    }}
                    disabled={activeFilterCount === 0}
                    className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Clear filters
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleExport()}
                    disabled={isExporting}
                    className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-950"
                  >
                    <Download className="h-4 w-4" />
                    {isExporting ? 'Exporting...' : 'Export Excel'}
                  </Button>
                </div>
              </div>
            </div>

        {/* Bulk Action Bar */}
        {selectedUsers.size > 0 && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <span className="text-sm font-medium text-slate-950">
              {selectedUsers.size} user(s) selected
            </span>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => handleBulkAction('Assign course')}>
                <BookOpen className="h-4 w-4" />
                Assign course
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleBulkAction('Change department')}
              >
                <Building2 className="h-4 w-4" />
                Change department
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => handleBulkAction('Deactivate')}
              >
                <Trash2 className="h-4 w-4" />
                Deactivate
              </Button>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_16px_45px_rgba(15,23,42,0.06)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80">
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      selectedUsers.size === filteredUsers.length && filteredUsers.length > 0
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  User
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Department
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Last login
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  Progress
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No users found
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => {
                  const roleStyle = roleColors[u.role] || roleColors.default;
                  const statusStyle = statusColors[u.status];
                  const StatusIcon = statusStyle?.icon || CheckCircle;
                  const displayName =
                    u.first_name || u.last_name
                      ? `${u.first_name} ${u.last_name}`.trim()
                      : u.email.split('@')[0];
                  const progressPercent =
                    u.progress.total > 0
                      ? Math.min((u.progress.completed / u.progress.total) * 100, 100)
                      : 0;
                  return (
                    <tr
                      key={u.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => router.push(routes.adminUserDetail(u.id))}
                    >
                      <td className="w-12 px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(u.id)}
                          onChange={(e) => handleSelectUser(u.id, e.target.checked)}
                          className="h-4 w-4 rounded border-border"
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-xs font-medium text-white">
                            {(u.first_name?.charAt(0) || u.email.charAt(0)).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-950">{displayName}</p>
                            <p className="font-mono text-xs text-slate-500">
                              {u.id.slice(0, 8)}...
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-text-primary">{u.department || '—'}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle?.bg} ${statusStyle?.text}`}
                        >
                          <StatusIcon className="h-3 w-3" />
                          {apiStatusMap[u.status] || u.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-500">{u.lastLogin}</td>
                      <td className="px-4 py-4">
                        <div className="w-[100px]">
                          <p className="text-xs text-slate-500">
                            {u.progress.completed} / {u.progress.total} courses
                          </p>
                          <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-600"
                              style={{
                                width: `${progressPercent}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
          </div>
        </section>

        {/* Detail Panel */}
        {selectedUser && (
          <div className="rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-lg font-medium text-white">
                  {(
                    selectedUser.first_name?.charAt(0) || selectedUser.email.charAt(0)
                  ).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    {selectedUser.first_name} {selectedUser.last_name}
                  </h3>
                  <p className="text-sm text-text-secondary">{selectedUser.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline">
                  <Shield className="mr-1 h-3 w-3" />
                  {selectedUser.role}
                </Badge>
                <Button variant="ghost" size="icon" onClick={() => setSelectedUser(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 p-4">
              {/* Left Column - Profile */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-text-primary">Profile</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-text-secondary">Department</span>
                    <span className="text-sm font-medium text-text-primary">
                      {selectedUser.department || '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-text-secondary">Role</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${roleColors[selectedUser.role]?.bg} ${roleColors[selectedUser.role]?.text}`}
                    >
                      {selectedUser.role}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-text-secondary">Status</span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[selectedUser.status]?.bg} ${statusColors[selectedUser.status]?.text}`}
                    >
                      {apiStatusMap[selectedUser.status] || selectedUser.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-text-secondary">Auth method</span>
                    <span className="text-sm font-medium text-text-primary">
                      Azure Entra ID (SSO)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-text-secondary">Joined</span>
                    <span className="text-sm font-medium text-text-primary">
                      {formatDateOnlyForUser(selectedUser.created_at, user?.timezone)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-text-secondary">Last login</span>
                    <span className="text-sm font-medium text-text-primary">
                      {selectedUser.lastLogin}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column - Assigned Courses */}
              <div>
                <h4 className="mb-3 text-sm font-semibold text-text-primary">Assigned courses</h4>
                <div className="space-y-2">
                  {selectedUser.courses.map((course, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                    >
                      <span className="text-sm text-text-primary">{course.name}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          course.status === 'Done'
                            ? 'bg-green-500/10 text-green-500'
                            : course.status === 'In progress'
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-gray-500/10 text-gray-500'
                        }`}
                      >
                        {course.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border p-4">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewRole(selectedUser?.role || '');
                    setShowRoleModal(true);
                  }}
                >
                  <Shield className="h-4 w-4" />
                  Change role
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewDept(selectedUser?.department || '');
                    setShowDeptModal(true);
                  }}
                >
                  <Building2 className="h-4 w-4" />
                  Change department
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    fetchCourses();
                    setShowAssignCourseModal(true);
                  }}
                >
                  <BookOpen className="h-4 w-4" />
                  Assign course
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowResetProgressModal(true)}>
                  <RefreshCw className="h-4 w-4" />
                  Reset progress
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResendInvite}
                  disabled={selectedUser?.status !== 'Pending'}
                >
                  <Mail className="h-4 w-4" />
                  Resend invite
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => selectedUser && fetchLoginHistory(selectedUser.id)}
                >
                  <Clock className="h-4 w-4" />
                  Login history
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeactivateModal(true)}
              >
                <Trash2 className="h-4 w-4" />
                Deactivate
              </Button>
            </div>
          </div>
        )}

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/45 p-4 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center py-8">
              <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-950 shadow-[0_30px_90px_rgba(15,23,42,0.28)]">
                <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                      <Mail className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Add New User</h2>
                      <p className="text-xs text-slate-500">
                        Capture the core identity and access information needed to create a complete
                        platform user.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4 px-6 py-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                        First Name
                      </label>
                      <Input
                        type="text"
                        value={inviteForm.first_name}
                        onChange={(e) =>
                          setInviteForm((p) => ({ ...p, first_name: e.target.value }))
                        }
                        placeholder="First name"
                        autoComplete="off"
                        className={inviteFieldClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                        Last Name
                      </label>
                      <Input
                        type="text"
                        value={inviteForm.last_name}
                        onChange={(e) =>
                          setInviteForm((p) => ({ ...p, last_name: e.target.value }))
                        }
                        placeholder="Last name"
                        autoComplete="off"
                        className={inviteFieldClassName}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                      Email
                    </label>
                    <Input
                      type="email"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="user@company.com"
                      autoComplete="off"
                      className={inviteFieldClassName}
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                        Role
                      </label>
                      <Select
                        options={roles.map((r) => ({ value: r, label: r }))}
                        value={inviteForm.role}
                        onChange={(e) => setInviteForm((p) => ({ ...p, role: e.target.value }))}
                        className={inviteSelectClassName}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                        Department
                      </label>
                      <Select
                        options={departmentOptions.map((d) => ({ value: d, label: d }))}
                        value={inviteForm.department || DEFAULT_DEPARTMENTS[0]}
                        onChange={(e) =>
                          setInviteForm((p) => ({ ...p, department: e.target.value }))
                        }
                        className={inviteSelectClassName}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowAddDepartment((current) => !current)}
                      className="text-xs text-emerald-700 hover:underline"
                    >
                      {showAddDepartment ? 'Cancel new department' : 'Add new department'}
                    </button>
                    {showAddDepartment && (
                      <div className="flex gap-2">
                        <Input
                          type="text"
                          value={newDepartmentName}
                          onChange={(e) => setNewDepartmentName(e.target.value)}
                          placeholder="New department name"
                          className={inviteFieldClassName}
                        />
                        <Button type="button" variant="outline" onClick={handleAddDepartment}>
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                      Password
                    </label>
                    <Input
                      type="password"
                      value={inviteForm.password}
                      onChange={(e) => setInviteForm((p) => ({ ...p, password: e.target.value }))}
                      placeholder="Set a password for direct local login"
                      autoComplete="new-password"
                      className={inviteFieldClassName}
                    />
                    <p className="text-[11px] font-medium text-slate-600">
                      Leave blank to send an invite and let the user set access later.
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
                  <Button
                    variant="outline"
                    onClick={closeInviteModal}
                    className="border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-100 hover:text-slate-950"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleInvite}
                    disabled={
                      isInviting ||
                      !inviteForm.first_name.trim() ||
                      !inviteForm.last_name.trim() ||
                      !inviteForm.email.trim()
                    }
                  >
                    {isInviting ? 'Adding...' : 'Add User'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import Modal */}
        {showImport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/20 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Upload className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Import Users from CSV</h2>
                  <p className="text-sm text-slate-600">Bulk import users from CSV file</p>
                </div>
              </div>

              <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4">
                <p className="mb-2 text-sm font-semibold text-slate-950">CSV Format</p>
                <code className="block rounded-xl border border-white bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm">
                  email,first_name,last_name,role,department
                </code>
                <div className="mt-3 space-y-1 text-xs leading-5 text-slate-700">
                  <p>
                    Required: <span className="font-semibold text-slate-950">email</span>,{' '}
                    <span className="font-semibold text-slate-950">first_name</span>,{' '}
                    <span className="font-semibold text-slate-950">last_name</span>,{' '}
                    <span className="font-semibold text-slate-950">role</span>.
                  </p>
                  <p>
                    Optional: <span className="font-semibold text-slate-950">department</span>.
                    Password is not imported; invited users set access later.
                  </p>
                  <p>
                    Roles: Admin, Manager, LearningExpert, TeamManager, TeamMember, TeamIntern.
                  </p>
                </div>
              </div>

              <div className="mb-5 space-y-2">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">
                  Select CSV File
                </label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="block w-full text-sm font-medium text-slate-800
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-xl file:border-0
                      file:bg-slate-950 file:text-white
                      file:cursor-pointer file:font-semibold
                      file:hover:bg-slate-800
                    "
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleDownloadImportTemplate}
                    className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <Download className="h-3 w-3" />
                    Template
                  </button>
                </div>
              </div>

              {importResult && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                  <p className="text-sm font-medium text-slate-950">Import Results:</p>
                  <div className="mt-2 flex gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-emerald-700">{importResult.success_count}</span>
                      <span className="text-slate-700"> users imported</span>
                    </div>
                  </div>
                  <div className="mt-1 flex gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-blue-700">{importResult.provisioned_count}</span>
                      <span className="text-slate-700"> provisioned</span>
                    </div>
                    <div>
                      <span className="font-semibold text-amber-700">{importResult.pending_count}</span>
                      <span className="text-slate-700"> pending invitation</span>
                    </div>
                  </div>
                  <div className="mt-1 flex gap-4 text-sm">
                    <div>
                      <span className="font-semibold text-slate-700">{importResult.skipped_count}</span>
                      <span className="text-slate-700"> skipped (duplicates)</span>
                    </div>
                  </div>
                  {importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <span className="text-destructive text-sm">
                        {importResult.errors.length} rows had errors
                      </span>
                    </div>
                  )}
                  {importResult.errors.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto rounded-lg bg-destructive/10 p-2">
                      {importResult.errors.map((err, idx) => (
                        <p key={idx} className="text-xs text-destructive">
                          Row {err.row}: {err.email ? `${err.email}: ` : ''}
                          {err.error}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowImport(false);
                    setSelectedFile(null);
                    setImportResult(null);
                  }}
                  className="border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!selectedFile || isImporting}
                  className="bg-slate-950 text-white hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-600"
                >
                  {isImporting ? 'Importing...' : 'Import Users'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Change Role Modal */}
        {showRoleModal && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Change Role</h2>
                  <p className="text-xs text-text-secondary">
                    Update {selectedUser.email}&apos;s role
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Select
                  options={roles.map((r) => ({ value: r, label: r }))}
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowRoleModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleChangeRole} disabled={actionLoading || !newRole}>
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Change Department Modal */}
        {showDeptModal && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Change Department</h2>
                  <p className="text-xs text-text-secondary">
                    Update {selectedUser.email}&apos;s department
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Select
                  options={departmentOptions.map((d) => ({ value: d, label: d }))}
                  value={newDept}
                  onChange={(e) => setNewDept(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowAddEditDepartment((current) => !current)}
                  className="text-xs text-primary hover:underline"
                >
                  {showAddEditDepartment ? 'Cancel new department' : 'Add new department'}
                </button>
                {showAddEditDepartment && (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={newEditDepartmentName}
                      onChange={(e) => setNewEditDepartmentName(e.target.value)}
                      placeholder="New department name"
                    />
                    <Button type="button" variant="outline" onClick={handleAddDepartmentForEdit}>
                      Save
                    </Button>
                  </div>
                )}
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowDeptModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleChangeDepartment} disabled={actionLoading || !newDept}>
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Assign Course Modal */}
        {showAssignCourseModal && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Assign Course</h2>
                  <p className="text-xs text-text-secondary">
                    Assign a course to {selectedUser.email}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <Select
                  options={availableCourses.map((c) => ({ value: c.id, label: c.title }))}
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                />
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowAssignCourseModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAssignCourse} disabled={actionLoading || !selectedCourseId}>
                  {actionLoading ? 'Assigning...' : 'Assign Course'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Reset Progress Modal */}
        {showResetProgressModal && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
                  <RefreshCw className="h-5 w-5 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Reset Progress</h2>
                  <p className="text-xs text-text-secondary">
                    This will reset all course progress for this user
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-sm text-text-primary">
                  Are you sure you want to reset progress for{' '}
                  <span className="font-medium">{selectedUser.email}</span>? This action cannot be
                  undone.
                </p>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowResetProgressModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleResetProgress}
                  disabled={actionLoading}
                  className="bg-amber-500 hover:bg-amber-600"
                >
                  {actionLoading ? 'Resetting...' : 'Reset Progress'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Login History Modal */}
        {showLoginHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Clock className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">Login History</h2>
                    <p className="text-xs text-text-secondary">Recent account activity</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowLoginHistoryModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {loginHistory.length === 0 ? (
                  <p className="text-sm text-text-secondary">No login history available</p>
                ) : (
                  loginHistory.map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-lg border border-border bg-background p-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-text-primary capitalize">
                          {entry.type.replace('_', ' ')}
                        </p>
                        <p className="text-xs text-text-secondary">
                          {formatDateForUser(entry.timestamp, user?.timezone)}
                        </p>
                      </div>
                      <Badge variant="secondary">{idx === 0 ? 'Most Recent' : 'Older'}</Badge>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Deactivate User Modal */}
        {showDeactivateModal && selectedUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-destructive/50 bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Deactivate User</h2>
                  <p className="text-xs text-text-secondary">
                    This will revoke access to the platform
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                <p className="text-sm text-text-primary">
                  Are you sure you want to deactivate{' '}
                  <span className="font-medium">{selectedUser.email}</span>? They will lose access
                  to the platform immediately.
                </p>
              </div>
              <div className="mt-6 flex justify-end gap-3">
                <Button variant="outline" onClick={() => setShowDeactivateModal(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleDeactivate}
                  disabled={actionLoading}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {actionLoading ? 'Deactivating...' : 'Deactivate User'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
