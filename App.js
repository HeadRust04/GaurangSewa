import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, setLogLevel, getDocs, query, where } from 'firebase/firestore';

// --- Helper Functions ---
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString + 'T00:00:00').toLocaleDateString(undefined, options);
};

const formatTime = (timeString) => {
    if (!timeString) return 'N/A';
    const [hours, minutes] = timeString.split(':');
    const h = parseInt(hours, 10);
    const m = parseInt(minutes, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const formattedHours = h % 12 || 12;
    const formattedMinutes = m < 10 ? '0' + m : m;
    return `${formattedHours}:${formattedMinutes} ${ampm}`;
};

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Main App Component ---
export default function App() {
    // Auth & DB State
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    // Login State
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [userType, setUserType] = useState(null);
    const [loginMode, setLoginMode] = useState('acharya');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState('');
    const [loggedInDevotee, setLoggedInDevotee] = useState(null);

    // App Data State
    const [devotees, setDevotees] = useState([]);
    const [tasks, setTasks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // View & Filter State
    const [view, setView] = useState('dashboard');
    const [historyFilter, setHistoryFilter] = useState({ type: 'month', value: new Date().toISOString().slice(0, 7) });
    const [dashboardDateFilter, setDashboardDateFilter] = useState('today'); // today, tomorrow, specific
    const [specificDate, setSpecificDate] = useState(new Date().toISOString().slice(0, 10));

    // Form & Modal State
    const [devoteeName, setDevoteeName] = useState('');
    const [generatedCredentials, setGeneratedCredentials] = useState(null);
    
    const [taskDescription, setTaskDescription] = useState('');
    const [assignedDevotee, setAssignedDevotee] = useState('');
    const [location, setLocation] = useState('');
    const [taskDate, setTaskDate] = useState(new Date().toISOString().split('T')[0]);
    const [taskTime, setTaskTime] = useState(new Date().toTimeString().slice(0, 5));
    const [taskCreationError, setTaskCreationError] = useState('');

    const [showDevoteeModal, setShowDevoteeModal] = useState(false);
    const [selectedDevoteeId, setSelectedDevoteeId] = useState(null);
    const [showTaskForm, setShowTaskForm] = useState(false);
    
    const [editingTask, setEditingTask] = useState(null); // Holds the task object for editing
    const [showEditTaskModal, setShowEditTaskModal] = useState(false);


    // --- Firebase Initialization and Auth ---
    useEffect(() => {
        try {
            setLogLevel('debug');
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
                        if (initialAuthToken) {
                            await signInWithCustomToken(authInstance, initialAuthToken);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (error) {
                        console.error("Error during sign-in:", error);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            setIsAuthReady(true);
        }
    }, []);

    // --- Data Fetching from Firestore (runs after login) ---
    useEffect(() => {
        if (!isLoggedIn || !isAuthReady || !db || !userId) {
            setIsLoading(devotees.length === 0 && tasks.length === 0);
            return;
        }

        const devoteesCollectionPath = `/artifacts/${appId}/users/${userId}/devotees`;
        const devoteesUnsubscribe = onSnapshot(collection(db, devoteesCollectionPath), (snapshot) => {
            const devoteesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDevotees(devoteesData);
            setIsLoading(false);
        }, (error) => console.error("Error fetching devotees:", error));

        const tasksCollectionPath = `/artifacts/${appId}/users/${userId}/tasks`;
        const tasksUnsubscribe = onSnapshot(collection(db, tasksCollectionPath), (snapshot) => {
            const tasksData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTasks(tasksData);
            setIsLoading(false);
        }, (error) => console.error("Error fetching tasks:", error));

        return () => {
            devoteesUnsubscribe();
            tasksUnsubscribe();
        };
    }, [isLoggedIn, isAuthReady, db, userId, appId]);

    // --- Login/Logout Handlers ---
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoginError('');
        if (loginMode === 'acharya') {
            if (username === 'Admin' && password === 'Hare Krishna') {
                setIsLoggedIn(true);
                setUserType('acharya');
                setUsername('');
                setPassword('');
            } else {
                setLoginError('Invalid Acharya credentials.');
            }
        } else {
            if (!db || !userId) {
                setLoginError('Database not ready. Please try again.');
                return;
            }
            try {
                const q = query(collection(db, `/artifacts/${appId}/users/${userId}/devotees`), where("username", "==", username));
                const querySnapshot = await getDocs(q);
                let userFound = false;
                querySnapshot.forEach((doc) => {
                    if (doc.data().password === password) {
                        setIsLoggedIn(true);
                        setUserType('devotee');
                        setLoggedInDevotee({ id: doc.id, ...doc.data() });
                        setUsername('');
                        setPassword('');
                        userFound = true;
                    }
                });
                if (!userFound) setLoginError('Invalid devotee credentials.');
            } catch (error) {
                console.error("Error logging in devotee:", error);
                setLoginError('An error occurred during login.');
            }
        }
    };
    
    const handleLogout = () => {
        setIsLoggedIn(false);
        setUserType(null);
        setLoggedInDevotee(null);
    };

    // --- Handlers for Devotees ---
    const handleAddDevotee = async (e) => {
        e.preventDefault();
        if (devoteeName.trim() === '' || !db || !userId) return;
        const newUsername = devoteeName.toLowerCase().replace(/\s/g, '') + Math.floor(100 + Math.random() * 900);
        const newPassword = Math.random().toString(36).slice(-8);
        try {
            await addDoc(collection(db, `/artifacts/${appId}/users/${userId}/devotees`), { 
                name: devoteeName.trim(),
                username: newUsername,
                password: newPassword
            });
            setGeneratedCredentials({ username: newUsername, password: newPassword });
            setDevoteeName('');
        } catch (error) {
            console.error("Error adding devotee: ", error);
        }
    };
    
    const handleDeleteDevotee = async (devoteeIdToDelete) => {
        if (!db || !userId) return;
        try {
            await deleteDoc(doc(db, `/artifacts/${appId}/users/${userId}/devotees/${devoteeIdToDelete}`));
            if (selectedDevoteeId === devoteeIdToDelete) {
                setSelectedDevoteeId(null);
            }
        } catch (error) {
            console.error("Error deleting devotee: ", error);
        }
    };
    
    // --- Handlers for Tasks ---
    const handleAddTask = async (e) => {
        e.preventDefault();
        setTaskCreationError('');
        if (!taskDescription.trim() || !assignedDevotee || !location.trim() || !taskDate || !taskTime || !db || !userId) {
            setTaskCreationError("Please fill all fields for the task.");
            return;
        }
        const selectedDateTime = new Date(`${taskDate}T${taskTime}`);
        if (selectedDateTime < new Date()) {
            setTaskCreationError('Cannot assign tasks to a past date or time.');
            return;
        }
        try {
            await addDoc(collection(db, `/artifacts/${appId}/users/${userId}/tasks`), {
                description: taskDescription.trim(),
                devoteeId: assignedDevotee,
                location: location.trim(),
                taskDate,
                taskTime,
                status: 'Pending',
                createdAt: new Date(),
            });
            setTaskDescription(''); setAssignedDevotee(''); setLocation(''); 
            setTaskDate(new Date().toISOString().split('T')[0]);
            setTaskTime(new Date().toTimeString().slice(0, 5));
            setShowTaskForm(false);
        } catch (error) {
            console.error("Error adding task: ", error);
            setTaskCreationError('Failed to add task. Please try again.');
        }
    };

    const handleOpenEditModal = (task) => {
        let taskToEdit = { ...task };
        const devoteeExists = devotees.some(d => d.id === taskToEdit.devoteeId);
        if (!devoteeExists && devotees.length > 0) {
            taskToEdit.devoteeId = devotees[0].id;
        } else if (!devoteeExists && devotees.length === 0) {
            taskToEdit.devoteeId = '';
        }
        setEditingTask(taskToEdit);
        setShowEditTaskModal(true);
    };

    const handleUpdateTask = async (e) => {
        e.preventDefault();
        if (!editingTask || !db || !userId) return;
        const { id, description, devoteeId, location, taskDate, taskTime } = editingTask;
        try {
            const taskDocRef = doc(db, `/artifacts/${appId}/users/${userId}/tasks/${id}`);
            await updateDoc(taskDocRef, {
                description,
                devoteeId,
                location,
                taskDate,
                taskTime,
            });
            setShowEditTaskModal(false);
            setEditingTask(null);
        } catch (error) {
            console.error("Error updating task: ", error);
        }
    };
    
    const handleUpdateTaskStatus = async (taskId, newStatus) => {
        if (!db || !userId) return;
        try {
            await updateDoc(doc(db, `/artifacts/${appId}/users/${userId}/tasks/${taskId}`), { status: newStatus });
        } catch (error) { console.error("Error updating task status: ", error); }
    };

    const handleDeleteTask = async (taskId) => {
        if (!db || !userId) return;
        try {
            await deleteDoc(doc(db, `/artifacts/${appId}/users/${userId}/tasks/${taskId}`));
        } catch (error) { console.error("Error deleting task: ", error); }
    };
    
    const getDevoteeNameById = (id) => devotees.find(d => d.id === id)?.name || 'Unknown';

    // --- RENDER METHODS ---
    const renderStatusBadge = (status) => {
        const base = "px-3 py-1 text-sm font-semibold rounded-full";
        const colors = {
            'Pending': 'bg-yellow-200 text-yellow-800',
            'In Progress': 'bg-blue-200 text-blue-800',
            'Completed': 'bg-green-200 text-green-800'
        };
        return <span className={`${base} ${colors[status] || 'bg-gray-200 text-gray-800'}`}>{status}</span>;
    };

    const renderDevoteeModal = () => {
        const selectedDevotee = selectedDevoteeId ? devotees.find(d => d.id === selectedDevoteeId) : null;
        const devoteeTasks = selectedDevoteeId ? tasks.filter(t => t.devoteeId === selectedDevoteeId) : [];
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white p-6 rounded-lg shadow-xl w-11/12 sm:w-full sm:max-w-lg max-h-full overflow-y-auto">
                    {!selectedDevotee ? (
                        <>
                            <h2 className="text-xl font-bold mb-4 text-orange-600">Manage Devotees</h2>
                            <form onSubmit={handleAddDevotee} className="mb-4">
                                <h3 className="font-semibold mb-2">Add New Devotee</h3>
                                <div className="flex gap-2">
                                <input type="text" value={devoteeName} onChange={(e) => setDevoteeName(e.target.value)} placeholder="Enter devotee's name" className="flex-grow p-2 border border-gray-300 rounded-lg"/>
                                <button type="submit" className="bg-orange-500 text-white font-bold py-2 px-4 rounded-lg">Add</button>
                                </div>
                            </form>
                            {generatedCredentials && (
                                <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded-lg relative mb-4">
                                    <strong className="font-bold">Devotee Created!</strong>
                                    <p>Username: <span className="font-mono text-xs sm:text-sm break-all">{generatedCredentials.username}</span></p>
                                    <p>Password: <span className="font-mono text-xs sm:text-sm break-all">{generatedCredentials.password}</span></p>
                                    <span onClick={() => setGeneratedCredentials(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer">&times;</span>
                                </div>
                            )}
                            <h3 className="font-semibold mb-2 mt-4">Existing Devotees</h3>
                            <div className="max-h-60 overflow-y-auto border p-2 rounded-lg">
                                {devotees.map(d => (
                                    <div key={d.id} className="flex justify-between items-center p-2 border-b hover:bg-orange-100">
                                        <span onClick={() => setSelectedDevoteeId(d.id)} className="flex-grow cursor-pointer">{d.name}</span>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteDevotee(d.id); }} 
                                            className="text-red-500 hover:text-red-700 p-1 rounded-full hover:bg-red-100" title={`Delete ${d.name}`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <button onClick={() => setSelectedDevoteeId(null)} className="text-orange-600 font-semibold mb-4">&larr; Back to List</button>
                            <h2 className="text-2xl font-bold mb-2 text-orange-700">{selectedDevotee.name}</h2>
                            <div className="bg-gray-100 p-3 rounded-lg mb-4">
                                <h3 className="font-bold">Credentials</h3>
                                <p>Username: <span className="font-mono bg-gray-200 px-2 py-1 rounded text-xs sm:text-sm break-all">{selectedDevotee.username}</span></p>
                                <p>Password: <span className="font-mono bg-gray-200 px-2 py-1 rounded text-xs sm:text-sm break-all">{selectedDevotee.password}</span></p>
                            </div>
                            <h3 className="font-bold mb-2">Assigned Tasks ({devoteeTasks.length})</h3>
                             <div className="space-y-2 max-h-48 overflow-y-auto">
                                {devoteeTasks.length > 0 ? devoteeTasks.map(task => (
                                    <div key={task.id} className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                                        <div className="flex justify-between items-center">
                                            <p className="font-semibold">{task.description}</p>
                                            {renderStatusBadge(task.status)}
                                        </div>
                                        <p className="text-sm text-gray-600">{task.location} on {formatDate(task.taskDate)}</p>
                                    </div>
                                )) : <p className="text-gray-500">No tasks assigned.</p>}
                             </div>
                        </>
                    )}
                    <button onClick={() => {setShowDevoteeModal(false); setGeneratedCredentials(null); setSelectedDevoteeId(null)}} className="mt-6 w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg">Close</button>
                </div>
            </div>
        );
    };

    const renderEditTaskModal = () => {
        if (!editingTask) return null;
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white p-6 rounded-lg shadow-xl w-11/12 sm:w-full sm:max-w-lg">
                    <h2 className="text-xl font-bold mb-4 text-yellow-600">Edit Task</h2>
                    <form onSubmit={handleUpdateTask} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-medium">Task Description</label>
                            <input type="text" value={editingTask.description} onChange={(e) => setEditingTask({...editingTask, description: e.target.value})} className="w-full p-3 border rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Assign to Devotee</label>
                            <select value={editingTask.devoteeId} onChange={(e) => setEditingTask({...editingTask, devoteeId: e.target.value})} className="w-full p-3 border rounded-lg bg-white">
                                {devotees.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Location</label>
                            <input type="text" value={editingTask.location} onChange={(e) => setEditingTask({...editingTask, location: e.target.value})} className="w-full p-3 border rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Date</label>
                            <input type="date" value={editingTask.taskDate} onChange={(e) => setEditingTask({...editingTask, taskDate: e.target.value})} className="w-full p-3 border rounded-lg" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium">Time</label>
                            <input type="time" value={editingTask.taskTime} onChange={(e) => setEditingTask({...editingTask, taskTime: e.target.value})} className="w-full p-3 border rounded-lg" />
                        </div>
                        <div className="sm:col-span-2 flex flex-col sm:flex-row gap-4 mt-2">
                            <button type="button" onClick={() => {setShowEditTaskModal(false); setEditingTask(null);}} className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-3 px-4 rounded-lg">Cancel</button>
                            <button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-4 rounded-lg shadow">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        );
    };

    const renderTaskCard = (task, isReadOnly = false) => {
        const isAssignedDevotee = userType === 'devotee' && task.devoteeId === loggedInDevotee?.id;
        const canUpdateStatus = userType === 'acharya' || isAssignedDevotee;
        const taskDateObj = new Date(task.taskDate + 'T00:00:00');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isFutureTask = taskDateObj > today;
        return (
            <div key={task.id} className="bg-orange-50 border rounded-lg p-5 shadow-sm hover:shadow-lg transition-shadow flex flex-col justify-between">
                <div>
                    <div className="flex justify-between items-start mb-2"><h3 className="font-bold text-lg text-orange-800">{task.description}</h3>{renderStatusBadge(task.status)}</div>
                    <p className="text-sm text-gray-600 mb-1"><strong>Devotee:</strong> {getDevoteeNameById(task.devoteeId)}</p>
                    <p className="text-sm text-gray-600 mb-1"><strong>Location:</strong> {task.location}</p>
                    <p className="text-sm text-gray-600"><strong>When:</strong> {formatDate(task.taskDate)} at {formatTime(task.taskTime)}</p>
                </div>
                {canUpdateStatus && !isReadOnly && (
                    <div className="mt-4 pt-4 border-t">
                        <div className="flex items-center justify-between">
                            <div className="flex-grow mr-2">
                                <select value={task.status} onChange={(e) => handleUpdateTaskStatus(task.id, e.target.value)} disabled={isFutureTask} title={isFutureTask ? "Status can only be updated on the day of the task." : "Update task status"} className="w-full text-sm p-2 border rounded-lg bg-white disabled:bg-gray-100 disabled:cursor-not-allowed">
                                    <option value="Pending">Pending</option>
                                    <option value="In Progress">In Progress</option>
                                    <option value="Completed">Completed</option>
                                </select>
                            </div>
                            {userType === 'acharya' && (
                                <div className="flex">
                                    <button onClick={() => handleOpenEditModal(task)} className="text-blue-500 hover:text-blue-700 p-2 rounded-full hover:bg-blue-100" title="Edit Task">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                    </button>
                                    <button onClick={() => handleDeleteTask(task.id)} className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-100" title="Delete Task"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                            )}
                        </div>
                         {isFutureTask && <p className="text-xs text-yellow-600 mt-1">Status can be updated on {formatDate(task.taskDate)}.</p>}
                    </div>
                )}
            </div>
        );
    };

    if (!isLoggedIn) {
        return (
            <div className="bg-orange-50 min-h-screen flex flex-col items-center justify-center font-sans p-4">
                <div className="text-center mb-8">
                     <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-orange-600">Gauranga Sewa Foundation</h1>
                     <p className="text-base sm:text-lg text-gray-600 mt-2">Devotee Task Management</p>
                </div>
                <div className="w-full max-w-md bg-white p-8 rounded-xl shadow-lg">
                    <div className="flex border-b border-gray-200 mb-6">
                        <button onClick={() => setLoginMode('acharya')} className={`flex-1 py-3 text-base sm:text-lg font-semibold transition-colors duration-300 ${loginMode === 'acharya' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-500'}`}>Acharya Login</button>
                        <button onClick={() => setLoginMode('devotee')} className={`flex-1 py-3 text-base sm:text-lg font-semibold transition-colors duration-300 ${loginMode === 'devotee' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-500'}`}>Devotee Login</button>
                    </div>
                    <form onSubmit={handleLogin}>
                        <div className="mb-4"><label className="block text-gray-700 text-sm font-bold mb-2">Username</label><input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="Enter username" /></div>
                        <div className="mb-6"><label className="block text-gray-700 text-sm font-bold mb-2">Password</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" placeholder="Enter password" /></div>
                        {loginError && <p className="text-red-500 text-sm text-center mb-4">{loginError}</p>}
                        <button type="submit" className="w-full bg-gradient-to-r from-orange-500 to-yellow-500 text-white font-bold py-3 px-4 rounded-lg shadow hover:opacity-90 transition duration-300">Login</button>
                    </form>
                </div>
                <footer className="text-center text-gray-500 text-sm mt-8"><p>Hare Krishna!</p></footer>
            </div>
        );
    }
    
    // --- ALL RECORDS PAGE ---
    if (view === 'history') {
        let filteredRecords = [];
        if (historyFilter.type === 'day') {
            filteredRecords = tasks.filter(task => task.taskDate === historyFilter.value);
        } else if (historyFilter.type === 'month') {
            filteredRecords = tasks.filter(task => task.taskDate.startsWith(historyFilter.value));
        } else if (historyFilter.type === 'all') {
            filteredRecords = tasks;
        }

        return (
             <div className="bg-orange-50 min-h-screen font-sans text-gray-800">
                <header className="bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg">
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left">
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2 sm:mb-0">All Task Records</h1>
                        <button onClick={() => setView('dashboard')} className="bg-white text-orange-600 font-semibold py-2 px-4 rounded-lg shadow hover:bg-orange-100 transition">&larr; Back to Dashboard</button>
                    </div>
                </header>
                <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                    <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                        <h2 className="text-xl font-bold mb-4">Filter Records</h2>
                        <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4">
                            <select value={historyFilter.type} onChange={e => {
                                const newType = e.target.value;
                                let newValue = '';
                                if (newType === 'month') newValue = new Date().toISOString().slice(0, 7);
                                if (newType === 'day') newValue = new Date().toISOString().slice(0, 10);
                                setHistoryFilter({ type: newType, value: newValue });
                            }} className="p-2 border rounded-lg w-full sm:w-auto">
                                <option value="month">By Month</option>
                                <option value="day">By Day</option>
                                <option value="all">All Tasks</option>
                            </select>
                            {historyFilter.type === 'day' && <input type="date" value={historyFilter.value} onChange={e => setHistoryFilter({ ...historyFilter, value: e.target.value })} className="p-2 border rounded-lg w-full sm:w-auto"/>}
                            {historyFilter.type === 'month' && <input type="month" value={historyFilter.value} onChange={e => setHistoryFilter({ ...historyFilter, value: e.target.value })} className="p-2 border rounded-lg w-full sm:w-auto"/>}
                        </div>
                    </div>
                     {filteredRecords.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                           {filteredRecords.sort((a, b) => new Date(b.taskDate) - new Date(a.taskDate)).map(task => renderTaskCard(task, true))}
                        </div>
                    ) : <p className="text-gray-500 text-center py-8">No records match the selected filter.</p>}
                </main>
             </div>
        );
    }

    // --- MAIN DASHBOARD VIEW ---
    let dashboardTasks = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    if (dashboardDateFilter === 'today') {
        dashboardTasks = tasks.filter(t => t.taskDate === todayStr);
    } else if (dashboardDateFilter === 'tomorrow') {
        dashboardTasks = tasks.filter(t => t.taskDate === tomorrowStr);
    } else if (dashboardDateFilter === 'specific') {
        dashboardTasks = tasks.filter(t => t.taskDate === specificDate);
    }

    const pendingDashboardTasks = dashboardTasks.filter(t => t.status !== 'Completed');
    const completedDashboardTasks = dashboardTasks.filter(t => t.status === 'Completed');
    
    return (
        <div className="bg-orange-50 min-h-screen font-sans text-gray-800">
            <header className="bg-gradient-to-r from-orange-500 to-yellow-500 text-white shadow-lg">
                <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-2">
                    <div className="text-center sm:text-left">
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">Gauranga Sewa Foundation</h1>
                        <p className="text-xs sm:text-sm text-orange-100">
                            Task Dashboard ({userType})
                            {userType === 'acharya' && ` | Total Devotees: ${devotees.length}`}
                        </p>
                    </div>
                    <button onClick={handleLogout} className="bg-white text-orange-600 font-semibold py-2 px-4 rounded-lg shadow hover:bg-orange-100 transition w-full sm:w-auto">Logout</button>
                </div>
            </header>

            <main className="container mx-auto p-4 sm:p-6 lg:p-8">
                {userType === 'acharya' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                        <button onClick={() => setShowDevoteeModal(true)} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-4 rounded-lg shadow transition transform hover:scale-105">Manage Devotees</button>
                         <button onClick={() => {setShowTaskForm(!showTaskForm); setTaskCreationError('');}} className={`w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-4 rounded-lg shadow transition transform hover:scale-105`}>{showTaskForm ? 'Close Task Form' : '📝 Assign New Task'}</button>
                        <button onClick={() => setView('history')} className="w-full bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg shadow transition transform hover:scale-105">View All Records</button>
                    </div>
                )}

                {showTaskForm && userType === 'acharya' && (
                     <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                        <h2 className="text-xl font-bold mb-4 text-yellow-600">Assign a New Task</h2>
                        <form onSubmit={handleAddTask} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2"><label className="block text-sm font-medium">Task Description</label><input type="text" value={taskDescription} onChange={(e) => setTaskDescription(e.target.value)} placeholder="e.g., Altar Decoration" className="w-full p-3 border rounded-lg focus:ring-yellow-400" /></div>
                            <div><label className="block text-sm font-medium">Assign to Devotee</label><select value={assignedDevotee} onChange={(e) => setAssignedDevotee(e.target.value)} className="w-full p-3 border rounded-lg bg-white focus:ring-yellow-400"><option value="">Select Devotee</option>{devotees.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
                            <div><label className="block text-sm font-medium">Location</label><input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g., Main Temple Hall" className="w-full p-3 border rounded-lg focus:ring-yellow-400" /></div>
                            <div><label className="block text-sm font-medium">Date</label><input type="date" value={taskDate} min={new Date().toISOString().split('T')[0]} onChange={(e) => setTaskDate(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-yellow-400" /></div>
                            <div><label className="block text-sm font-medium">Time</label><input type="time" value={taskTime} onChange={(e) => setTaskTime(e.target.value)} className="w-full p-3 border rounded-lg focus:ring-yellow-400" /></div>
                            <div className="sm:col-span-2">{taskCreationError && <p className="text-red-500 text-sm mb-2">{taskCreationError}</p>}<button type="submit" className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-4 rounded-lg shadow">Assign Task</button></div>
                        </form>
                    </div>
                )}
                
                {showEditTaskModal && renderEditTaskModal()}
                {showDevoteeModal && userType === 'acharya' && renderDevoteeModal()}

                <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
                    <div className="flex flex-col sm:flex-row flex-wrap items-center gap-4 mb-6">
                        <h2 className="text-xl sm:text-2xl font-bold text-orange-700">Daily Tasks</h2>
                        <select value={dashboardDateFilter} onChange={e => setDashboardDateFilter(e.target.value)} className="p-2 border rounded-lg bg-white w-full sm:w-auto">
                            <option value="today">Today</option>
                            <option value="tomorrow">Tomorrow</option>
                            <option value="specific">Specific Date</option>
                        </select>
                        {dashboardDateFilter === 'specific' && <input type="date" value={specificDate} min={new Date().toISOString().split('T')[0]} onChange={e => setSpecificDate(e.target.value)} className="p-2 border rounded-lg w-full sm:w-auto"/>}
                    </div>
                    {isLoading ? <div className="text-center p-8">Loading tasks...</div> : (
                        dashboardTasks.length === 0 ? <div className="text-center p-8 text-gray-500">No tasks scheduled for this day.</div> : (
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-xl font-bold mb-4 text-orange-700 border-b-2 border-orange-200 pb-2">Pending & In Progress</h3>
                                    {pendingDashboardTasks.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {pendingDashboardTasks.map(task => renderTaskCard(task))}
                                        </div>
                                    ) : <p className="text-gray-500 pl-2 mt-4">No pending tasks for this day.</p>}
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold mb-4 text-green-700 border-b-2 border-green-200 pb-2">Completed</h3>
                                    {completedDashboardTasks.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {completedDashboardTasks.map(task => renderTaskCard(task))}
                                        </div>
                                    ) : <p className="text-gray-500 pl-2 mt-4">No tasks completed for this day.</p>}
                                </div>
                            </div>
                        )
                    )}
                </div>
                 <footer className="text-center text-gray-500 text-sm mt-8 pb-4">
                    <p>Hare Krishna! This tool is for the service of the devotees.</p>
                </footer>
            </main>
        </div>
    );
}

