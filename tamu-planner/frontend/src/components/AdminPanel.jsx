import React, { useState, useEffect, useCallback } from 'react';
import { Search, Plus, Edit2, Trash2, X, Save, Loader2, AlertTriangle } from 'lucide-react';

const EMPTY_FORM = {
  primary_subject: '',
  primary_number: '',
  title: '',
  credits_min: '',
  credits_max: '',
  description_raw: '',
  prereq_raw: '',
};

function CourseFormModal({ course, onSave, onClose, saving }) {
  const isEdit = Boolean(course?.course_id);
  const [form, setForm] = useState(() => {
    if (!course) return { ...EMPTY_FORM };
    const credits = course.credits ?? {};
    return {
      primary_subject: course.primary_subject ?? '',
      primary_number: course.primary_number ?? '',
      title: course.title ?? '',
      credits_min: typeof credits === 'number' ? String(credits) : String(credits.min ?? ''),
      credits_max: typeof credits === 'number' ? String(credits) : String(credits.max ?? ''),
      description_raw: course.description_raw ?? '',
      prereq_raw: course.prereq_raw ?? '',
    };
  });

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const min = Number(form.credits_min) || 0;
    const max = Number(form.credits_max) || min;
    onSave({
      primary_subject: form.primary_subject.trim().toUpperCase(),
      primary_number: form.primary_number.trim(),
      title: form.title.trim(),
      credits: min === max ? min : { min, max },
      department: { code: form.primary_subject.trim().toUpperCase(), name: form.primary_subject.trim().toUpperCase() },
      description_raw: form.description_raw.trim() || null,
      prereq_raw: form.prereq_raw.trim() || null,
    });
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#500000] focus:border-transparent outline-none text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100';
  const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900">{isEdit ? 'Edit Course' : 'Add Course'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Subject</label>
              <input className={inputCls} value={form.primary_subject} onChange={set('primary_subject')} placeholder="CSCE" required />
            </div>
            <div>
              <label className={labelCls}>Number</label>
              <input className={inputCls} value={form.primary_number} onChange={set('primary_number')} placeholder="121" required />
            </div>
          </div>
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={form.title} onChange={set('title')} placeholder="Introduction to Programming" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Credits (min)</label>
              <input className={inputCls} type="number" min="0" max="12" value={form.credits_min} onChange={set('credits_min')} placeholder="3" required />
            </div>
            <div>
              <label className={labelCls}>Credits (max)</label>
              <input className={inputCls} type="number" min="0" max="12" value={form.credits_max} onChange={set('credits_max')} placeholder="3" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea className={inputCls} rows={3} value={form.description_raw} onChange={set('description_raw')} placeholder="Course description..." />
          </div>
          <div>
            <label className={labelCls}>Prerequisites</label>
            <input className={inputCls} value={form.prereq_raw} onChange={set('prereq_raw')} placeholder="CSCE 120 or equivalent" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: '#500000' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ course, onConfirm, onClose, deleting }) {
  const code = `${course.primary_subject} ${course.primary_number}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full"><AlertTriangle size={20} className="text-red-600 dark:text-red-400" /></div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Delete Course</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Are you sure you want to delete <span className="font-semibold">{code} &mdash; {course.title}</span>? This action cannot be undone.
          </p>
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminPanel({ apiBase, authHeaders, onCatalogChange }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [editCourse, setEditCourse] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteCourse, setDeleteCourse] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const fetchCourses = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : '';
      const resp = await fetch(`${apiBase}/admin/courses${params}`, { headers: authHeaders() });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      setCourses(data.courses || []);
      setPage(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders, searchQuery]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const handleAdd = async (courseData) => {
    setSaving(true);
    try {
      const resp = await fetch(`${apiBase}/admin/courses`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(courseData),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      setShowAddModal(false);
      fetchCourses();
      onCatalogChange?.();
    } catch (err) {
      alert(`Failed to add course: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (courseData) => {
    if (!editCourse) return;
    setSaving(true);
    try {
      const resp = await fetch(`${apiBase}/admin/courses/${editCourse.course_id}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(courseData),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      setEditCourse(null);
      fetchCourses();
      onCatalogChange?.();
    } catch (err) {
      alert(`Failed to update course: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCourse) return;
    setDeleting(true);
    try {
      const resp = await fetch(`${apiBase}/admin/courses/${deleteCourse.course_id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${resp.status}`);
      }
      setDeleteCourse(null);
      fetchCourses();
      onCatalogChange?.();
    } catch (err) {
      alert(`Failed to delete course: ${err.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const paged = courses.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(courses.length / PAGE_SIZE);

  const formatCredits = (c) => {
    if (c == null) return '—';
    if (typeof c === 'number') return String(c);
    if (c.min != null && c.max != null) return c.min === c.max ? String(c.min) : `${c.min}–${c.max}`;
    return '—';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Course Administration</h2>
          <p className="text-sm text-gray-500 mt-1">{courses.length} course{courses.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg hover:opacity-90"
          style={{ backgroundColor: '#500000' }}
        >
          <Plus size={16} /> Add Course
        </button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search by course code or title..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#500000] focus:border-transparent outline-none text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40">
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Code</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Title</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Credits</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600 dark:text-gray-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-gray-400">
                        {searchQuery ? 'No courses match your search.' : 'No courses found.'}
                      </td>
                    </tr>
                  ) : (
                    paged.map((course) => (
                      <tr key={course.course_id} className="border-b dark:border-gray-700 last:border-b-0 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                          {course.primary_subject} {course.primary_number}
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{course.title}</td>
                        <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-400">{formatCredits(course.credits)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => setEditCourse(course)}
                              className="p-1.5 text-gray-500 hover:text-[#500000] hover:bg-gray-100 rounded-lg transition-colors"
                              title="Edit"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button
                              onClick={() => setDeleteCourse(course)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, courses.length)} of {courses.length}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed dark:text-gray-300"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {showAddModal && (
        <CourseFormModal course={null} onSave={handleAdd} onClose={() => setShowAddModal(false)} saving={saving} />
      )}
      {editCourse && (
        <CourseFormModal course={editCourse} onSave={handleEdit} onClose={() => setEditCourse(null)} saving={saving} />
      )}
      {deleteCourse && (
        <DeleteConfirmModal course={deleteCourse} onConfirm={handleDelete} onClose={() => setDeleteCourse(null)} deleting={deleting} />
      )}
    </div>
  );
}
