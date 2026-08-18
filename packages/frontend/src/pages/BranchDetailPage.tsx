import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardBody, Button, Spinner, Badge } from '../components/ui';
import { Building2, ArrowLeft, Users, Calendar, DollarSign, MapPin, Phone, Mail, Edit } from 'lucide-react';
import { apiClient as api } from '../lib/api';
import toast from 'react-hot-toast';
import { useClinicMoney } from '../stores/clinicConfigurationStore';

export default function BranchDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const formatMoney = useClinicMoney();
  interface Branch { id: string; name: string; code: string; type: string; address?: string; city?: string; governorate?: string; phone?: string; email?: string; manager_name?: string; capacity?: number; is_active: boolean; stats?: { patients: number; appointments: number; revenue: number; total_revenue?: number; staff: number; }; patients?: BranchPatient[]; [key: string]: unknown; }
interface StaffMember { id: string; name: string; role: string; specialization?: string; is_active: boolean; }
interface BranchPatient { id: string; first_name: string; last_name: string; mrn: string; phone: string; is_active: boolean; }
  const [branch, setBranch] = useState<Branch | null>(null);
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [patients, setPatients] = useState<BranchPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');

  useEffect(() => {
    const load = async () => {
      try {
        const [bRes, sRes, pRes] = await Promise.all([
          api.get(`/branches/${id}`),
          api.get(`/branches/${id}/staff`),
          api.get(`/branches/${id}/patients?limit=50`),
        ]);
        setBranch(bRes.data.data);
        setStaff(sRes.data.data || []);
        setPatients(pRes.data.data?.rows || pRes.data.data || []);
      } catch { toast.error('Failed to load branch details'); }
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return <Spinner />;
  if (!branch) return <div className="text-center py-12 text-gray-500">Branch not found</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/branches')}><ArrowLeft className="w-4 h-4" /></Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{branch.name}</h1>
          <p className="text-sm text-gray-500">{branch.code} — {branch.type}</p>
        </div>
        <Badge variant={branch.is_active ? 'success' : 'danger'}>{branch.is_active ? 'Active' : 'Inactive'}</Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardBody className="p-4 text-center">
          <Users className="w-6 h-6 text-blue-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{branch.stats?.patients || 0}</p>
          <p className="text-xs text-gray-500">Patients</p>
        </CardBody></Card>
        <Card><CardBody className="p-4 text-center">
          <Calendar className="w-6 h-6 text-green-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{branch.stats?.appointments || 0}</p>
          <p className="text-xs text-gray-500">Total Appointments</p>
        </CardBody></Card>
        <Card><CardBody className="p-4 text-center">
          <DollarSign className="w-6 h-6 text-yellow-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{formatMoney(branch.stats?.total_revenue || 0)}</p>
          <p className="text-xs text-gray-500">Revenue</p>
        </CardBody></Card>
        <Card><CardBody className="p-4 text-center">
          <Users className="w-6 h-6 text-purple-500 mx-auto mb-1" />
          <p className="text-2xl font-bold">{staff.length}</p>
          <p className="text-xs text-gray-500">Staff</p>
        </CardBody></Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[{key:'overview',label:'Overview'},{key:'staff',label:`Staff (${staff.length})`},{key:'patients',label:`Patients (${patients.length})`}].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <Card><CardBody className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Location Details</h3>
              {branch.address && <p className="flex items-center gap-2 text-sm text-gray-600"><MapPin className="w-4 h-4" /> {branch.address}, {branch.city}, {branch.governorate}</p>}
              {branch.phone && <p className="flex items-center gap-2 text-sm text-gray-600"><Phone className="w-4 h-4" /> {branch.phone}</p>}
              {branch.email && <p className="flex items-center gap-2 text-sm text-gray-600"><Mail className="w-4 h-4" /> {branch.email}</p>}
            </div>
            <div className="space-y-3">
              <h3 className="font-semibold text-gray-900">Operations</h3>
              <p className="text-sm text-gray-600">Manager: {branch.manager_name || 'Not assigned'}</p>
              <p className="text-sm text-gray-600">Capacity: {branch.capacity || 'Unlimited'}</p>
              <p className="text-sm text-gray-600">Type: <Badge>{branch.type}</Badge></p>
            </div>
          </div>
        </CardBody></Card>
      )}

      {tab === 'staff' && (
        <Card><CardBody className="p-0">
          {staff.length === 0 ? <div className="p-6 text-center text-gray-500">No staff assigned</div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Role</th><th className="px-4 py-3 text-left">Specialization</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
              <tbody>{staff.map((s: StaffMember) => (
                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3"><Badge>{s.role}</Badge></td>
                  <td className="px-4 py-3 text-gray-600">{s.specialization || '-'}</td>
                  <td className="px-4 py-3"><Badge variant={s.is_active ? 'success' : 'danger'}>{s.is_active ? 'Active' : 'Inactive'}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardBody></Card>
      )}

      {tab === 'patients' && (
        <Card><CardBody className="p-0">
          {patients.length === 0 ? <div className="p-6 text-center text-gray-500">No patients at this branch</div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">MRN</th><th className="px-4 py-3 text-left">Phone</th><th className="px-4 py-3 text-left">Status</th></tr></thead>
              <tbody>{patients.map((p: BranchPatient) => (
                <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/patients/${p.id}`)}>
                  <td className="px-4 py-3 font-medium">{p.first_name} {p.last_name}</td>
                  <td className="px-4 py-3 text-gray-600">{p.mrn}</td>
                  <td className="px-4 py-3 text-gray-600">{p.phone}</td>
                  <td className="px-4 py-3"><Badge variant={p.is_active ? 'success' : 'danger'}>{p.is_active ? 'Active' : 'Inactive'}</Badge></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </CardBody></Card>
      )}
    </div>
  );
}
