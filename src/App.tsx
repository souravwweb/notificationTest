import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  where,
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebaseClient';

// TypeScript Types
interface Profile {
  id: string;
  username: string;
  email: string;
  created_at: any;
}

interface Message {
  id: string;
  sender_id: string;
  sender_username: string;
  sender_email: string;
  content: string;
  tagged_user_id: string | null;
  tagged_username: string | null;
  created_at: string;
}

interface ToastType {
  id: string;
  title: string;
  message: string;
  icon: string;
}

// Retro chime sound generated via Web Audio API
const playNotificationSound = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Note 1 (C5)
    const osc1 = audioCtx.createOscillator();
    const gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime);
    gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.15);
    osc1.start(audioCtx.currentTime);
    osc1.stop(audioCtx.currentTime + 0.15);

    // Note 2 (E5)
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.1);
    gain2.gain.setValueAtTime(0.08, audioCtx.currentTime + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.005, audioCtx.currentTime + 0.35);
    osc2.start(audioCtx.currentTime + 0.1);
    osc2.stop(audioCtx.currentTime + 0.35);
  } catch (e) {
    console.warn("AudioContext failed or blocked by autoplay policy:", e);
  }
};

// Browser HTML5 Notification Helpers
const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission();
    return permission;
  }
  return 'denied';
};

const sendBrowserNotification = (title: string, body: string) => {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then((reg) => {
          reg.showNotification(title, {
            body,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: 'notireact-mention',
            renotify: true,
          } as any);
        }).catch((err) => {
          console.warn("Service worker ready failed, using standard Notification:", err);
          new Notification(title, {
            body,
            icon: '/favicon.svg',
          });
        });
      } else {
        new Notification(title, {
          body,
          icon: '/favicon.svg',
        });
      }
    } catch (e) {
      console.warn("Browser notification failed to fire:", e);
    }
  }
};

// Main App component coordinating Toast Notifications & Global Auth State
export default function App() {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState<ToastType[]>([]);

  // Add toast method exposed to child components
  const addToast = (title: string, message: string, icon: string = '🔔') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, title, message, icon }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  useEffect(() => {
    // Register Service Worker to handle click events (e.g. restoring window focus)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => console.log('Service Worker registered successfully:', reg.scope))
        .catch((err) => console.warn('Service Worker registration failed:', err));
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="auth-wrapper">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="avatar-badge" style={{ animation: 'spin 2s linear infinite', width: '50px', height: '50px', fontSize: '1.5rem' }}>⏳</div>
          <p style={{ color: 'var(--color-text-secondary)' }}>Loading NotiReact...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      {/* Toast Notification Portal */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span className="toast-icon">{toast.icon}</span>
            <div className="toast-body">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-message">{toast.message}</div>
            </div>
            <button className="toast-close" onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}>&times;</button>
          </div>
        ))}
      </div>

      <Routes>
        <Route 
          path="/login" 
          element={currentUser ? <Navigate to="/dashboard" replace /> : <Login addToast={addToast} />} 
        />
        <Route 
          path="/dashboard" 
          element={currentUser ? <Dashboard currentUser={currentUser} addToast={addToast} /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="*" 
          element={<Navigate to={currentUser ? "/dashboard" : "/login"} replace />} 
        />
      </Routes>
    </BrowserRouter>
  );
}

// ----------------------------------------------------
// LOGIN & SIGNUP PAGE COMPONENT
// ----------------------------------------------------
function Login({ addToast }: { addToast: (t: string, m: string, i?: string) => void }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg('');

    const sanitizedUsername = username.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();

    if (isSignUp) {
      if (!sanitizedUsername) {
        setErrorMsg('Username is required for signup.');
        setSubmitting(false);
        return;
      }
      
      try {
        // 1. Check unique username in Firestore
        const q = query(collection(db, 'profiles'), where('username', '==', sanitizedUsername));
        const usernameCheck = await getDocs(q);
        if (!usernameCheck.empty) {
          setErrorMsg(`Username @${sanitizedUsername} is already taken.`);
          setSubmitting(false);
          return;
        }

        // 2. Register User
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // 3. Update Auth display name
        await updateProfile(user, { displayName: sanitizedUsername });

        // 4. Create Firestore profile document
        await setDoc(doc(db, 'profiles', user.uid), {
          id: user.uid,
          username: sanitizedUsername,
          email: email.toLowerCase(),
          created_at: serverTimestamp()
        });

        addToast('Sign Up Successful', `Welcome to NotiReact, @${sanitizedUsername}!`, '🎉');
      } catch (error: any) {
        setErrorMsg(error.message);
        addToast('Sign Up Failed', error.message, '❌');
      }
    } else {
      try {
        await signInWithEmailAndPassword(auth, email, password);
        addToast('Welcome Back', 'Logged in successfully.', '🔓');
      } catch (error: any) {
        setErrorMsg(error.message);
        addToast('Login Failed', error.message, '❌');
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card glass-container">
        <div className="auth-header">
          <div className="nav-brand" style={{ justifyContent: 'center', marginBottom: '1rem' }}>
            <span>⚡</span> NotiReact
          </div>
          <h2>{isSignUp ? 'Create Account' : 'Welcome Back'}</h2>
          <p>{isSignUp ? 'Sign up to message & tag other users with instant notifications' : 'Login to view your mentions and chat feeds'}</p>
        </div>

        {errorMsg && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem', borderRadius: '10px', color: '#f87171', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {isSignUp && (
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                type="text"
                className="input-control"
                placeholder="e.g. coder_alice"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              className="input-control"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input-control"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '1rem' }} disabled={submitting}>
            {submitting ? 'Processing...' : isSignUp ? 'Sign Up' : 'Log In'}
          </button>
        </form>

        <div className="auth-footer">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button 
            className="tab-btn" 
            style={{ color: 'var(--accent-primary)', fontSize: '0.9rem', padding: '0 0.25rem', border: 'none', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => {
              setIsSignUp(!isSignUp);
              setErrorMsg('');
            }}
          >
            {isSignUp ? 'Log In' : 'Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------
// MAIN DASHBOARD COMPONENT
// ----------------------------------------------------
function Dashboard({ currentUser, addToast }: { currentUser: any, addToast: (t: string, m: string, i?: string) => void }) {
  const navigate = useNavigate();

  // App States
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<'inbox' | 'global' | 'sent'>('inbox');
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>('default');
  const [showBanner, setShowBanner] = useState(true);

  // Username edit states
  const [editingUsername, setEditingUsername] = useState(false);
  const [tempUsername, setTempUsername] = useState('');

  // Composer States
  const [composeContent, setComposeContent] = useState('');
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [searchMention, setSearchMention] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);

  // References to keep listener functions pure without re-subscription
  const allProfilesRef = useRef<Profile[]>([]);
  const authUserIdRef = useRef<string | null>(null);
  const isFirstMount = useRef(true);

  useEffect(() => {
    allProfilesRef.current = allProfiles;
  }, [allProfiles]);

  useEffect(() => {
    authUserIdRef.current = currentUser.uid;
  }, [currentUser.uid]);

  // Request browser notification state
  useEffect(() => {
    if ('Notification' in window) {
      setNotifPermission(Notification.permission);
      
      // Auto prompt on mount if default
      if (Notification.permission === 'default') {
        setTimeout(() => {
          requestNotificationPermission().then((perm) => {
            setNotifPermission(perm);
            if (perm === 'granted') {
              addToast('Notifications Enabled', 'You will receive desktop push notification updates!', '🟢');
              playNotificationSound();
            }
          });
        }, 1500);
      }
    }
  }, []);

  // Fetch profiles & subscribe to realtime message snapshot
  useEffect(() => {
    // 1. Fetch current profile
    const unsubMyProfile = onSnapshot(doc(db, 'profiles', currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Profile;
        setProfile(data);
        setTempUsername(data.username);
      }
    });

    // 2. Fetch all profiles for search suggestions
    const unsubAllProfiles = onSnapshot(collection(db, 'profiles'), (snap) => {
      const list: Profile[] = [];
      snap.forEach((doc) => {
        list.push(doc.data() as Profile);
      });
      setAllProfiles(list);
    });

    // 3. Realtime listening of messages
    const qMessages = query(collection(db, 'messages'), orderBy('created_at', 'desc'), limit(100));
    const unsubMessages = onSnapshot(qMessages, (snap) => {
      const list: Message[] = [];
      
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const mData = change.doc.data();
          const timestamp = mData.created_at as Timestamp;
          const msgObj: Message = {
            id: change.doc.id,
            sender_id: mData.sender_id,
            sender_username: mData.sender_username,
            sender_email: mData.sender_email,
            content: mData.content,
            tagged_user_id: mData.tagged_user_id,
            tagged_username: mData.tagged_username,
            created_at: timestamp ? timestamp.toDate().toISOString() : new Date().toISOString()
          };

          // If this is a real-time append (not initial loading of list)
          if (!isFirstMount.current) {
            // Check if current user is tagged, and they are not the sender
            if (msgObj.tagged_user_id === authUserIdRef.current && msgObj.sender_id !== authUserIdRef.current) {
              addToast('New Mention!', `@${msgObj.sender_username} tagged you: "${msgObj.content}"`, '💬');
              playNotificationSound();
              sendBrowserNotification(`Mentioned by @${msgObj.sender_username}`, msgObj.content);
            }
          }
        }
      });

      // Update full message history state
      snap.forEach((doc) => {
        const mData = doc.data();
        const timestamp = mData.created_at as Timestamp;
        list.push({
          id: doc.id,
          sender_id: mData.sender_id,
          sender_username: mData.sender_username,
          sender_email: mData.sender_email,
          content: mData.content,
          tagged_user_id: mData.tagged_user_id,
          tagged_username: mData.tagged_username,
          created_at: timestamp ? timestamp.toDate().toISOString() : new Date().toISOString()
        });
      });

      setMessages(list);
      isFirstMount.current = false;
    });

    return () => {
      unsubMyProfile();
      unsubAllProfiles();
      unsubMessages();
    };
  }, [currentUser.uid]);

  // Request browser notifications permission
  const handleToggleBrowserNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifPermission(permission);
    
    if (permission === 'granted') {
      addToast('Notifications Enabled', 'You will receive desktop push notification updates!', '🟢');
      playNotificationSound();
    } else if (permission === 'denied') {
      addToast('Notifications Blocked', 'Permission is blocked in browser settings. Click the lock/settings icon next to your URL bar to allow notifications.', '❌');
    } else {
      addToast('Permission Dismissed', 'Notifications were not enabled.', '⚠️');
    }
  };

  // Sign out user
  const handleSignOut = async () => {
    await signOut(auth);
    addToast('Signed Out', 'You have been logged out successfully.', '🔒');
    navigate('/login');
  };

  // Update profile username
  const handleUpdateUsername = async () => {
    const sanitized = tempUsername.toLowerCase().replace(/[^a-z0-9_]/g, '').trim();
    if (!sanitized) {
      addToast('Validation Error', 'Username cannot be blank.', '⚠️');
      return;
    }

    if (sanitized === profile?.username) {
      setEditingUsername(false);
      return;
    }

    // Check if username is already taken
    const taken = allProfiles.some((p) => p.username === sanitized && p.id !== currentUser.uid);
    if (taken) {
      addToast('Username Taken', `The username @${sanitized} is already in use.`, '❌');
      return;
    }

    try {
      // 1. Update Firestore profile doc
      await updateDoc(doc(db, 'profiles', currentUser.uid), {
        username: sanitized
      });

      // 2. Update Firebase auth metadata profile
      await updateProfile(currentUser, { displayName: sanitized });

      addToast('Profile Updated', `Your username is now @${sanitized}`, '✅');
      setEditingUsername(false);
    } catch (err: any) {
      addToast('Update Failed', err.message, '❌');
    }
  };

  // Filter autocomplete list suggestion matching @ search
  const filteredSuggestions = allProfiles.filter((p) =>
    p.username.toLowerCase().includes(searchMention.toLowerCase()) && p.id !== currentUser.uid
  );

  const handleComposeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setComposeContent(val);

    const selectionStart = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, selectionStart);
    const words = textBeforeCursor.split(/\s+/);
    const lastWord = words[words.length - 1];

    if (lastWord && lastWord.startsWith('@')) {
      const searchString = lastWord.slice(1);
      setSearchMention(searchString);
      setShowAutocomplete(true);
      setAutocompleteIndex(0);
    } else {
      setShowAutocomplete(false);
    }
  };

  // Insert mention token into compose input
  const insertMention = (targetUsername: string) => {
    const textarea = document.getElementById('compose-box') as HTMLTextAreaElement;
    if (!textarea) return;

    const val = composeContent;
    const selectionStart = textarea.selectionStart;
    const textBeforeCursor = val.slice(0, selectionStart);
    const textAfterCursor = val.slice(selectionStart);
    
    const words = textBeforeCursor.split(/\s+/);
    words[words.length - 1] = `@${targetUsername}`;
    
    const newTextBefore = words.join(' ') + ' ';
    setComposeContent(newTextBefore + textAfterCursor);
    setShowAutocomplete(false);

    // Focus input
    setTimeout(() => {
      textarea.focus();
      const pos = newTextBefore.length;
      textarea.setSelectionRange(pos, pos);
    }, 50);
  };

  const handleComposeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showAutocomplete && filteredSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex((prev) => (prev + 1) % filteredSuggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex((prev) => (prev - 1 + filteredSuggestions.length) % filteredSuggestions.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        insertMention(filteredSuggestions[autocompleteIndex].username);
      } else if (e.key === 'Escape') {
        setShowAutocomplete(false);
      }
    }
  };

  // Create message document in Firestore
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeContent.trim()) return;

    // Parse the first valid @username tag
    const words = composeContent.split(/\s+/);
    let taggedId: string | null = null;
    let taggedName: string | null = null;

    for (const word of words) {
      if (word.startsWith('@')) {
        const candidateUsername = word.slice(1).replace(/[^a-zA-Z0-9_]/g, '');
        const matchedProfile = allProfiles.find(
          (p) => p.username.toLowerCase() === candidateUsername.toLowerCase()
        );
        if (matchedProfile) {
          taggedId = matchedProfile.id;
          taggedName = matchedProfile.username;
          break;
        }
      }
    }

    try {
      await addDoc(collection(db, 'messages'), {
        sender_id: currentUser.uid,
        sender_username: profile?.username || 'user',
        sender_email: currentUser.email,
        content: composeContent,
        tagged_user_id: taggedId,
        tagged_username: taggedName,
        created_at: serverTimestamp()
      });
      setComposeContent('');
      setShowAutocomplete(false);
    } catch (err: any) {
      addToast('Send Failed', err.message, '❌');
    }
  };

  const handleReplyClick = (targetUsername: string) => {
    setComposeContent((prev) => {
      const tag = `@${targetUsername} `;
      if (prev.includes(tag)) return prev;
      return tag + prev;
    });
    const textarea = document.getElementById('compose-box');
    if (textarea) {
      textarea.focus();
    }
  };

  const renderMessageContent = (text: string) => {
    const words = text.split(/(\s+)/);
    return words.map((word, idx) => {
      if (word.startsWith('@')) {
        const usernameOnly = word.slice(1).replace(/[^a-zA-Z0-9_]/g, '');
        const restOfWord = word.slice(usernameOnly.length + 1);
        const isMatched = allProfiles.some(p => p.username.toLowerCase() === usernameOnly.toLowerCase());

        if (isMatched) {
          const isMe = profile && usernameOnly.toLowerCase() === profile.username.toLowerCase();
          return (
            <span key={idx}>
              <span className={`mention-badge ${isMe ? 'me' : ''}`}>
                @{usernameOnly}
              </span>
              {restOfWord}
            </span>
          );
        }
      }
      return word;
    });
  };

  // Filter boxes
  const inboxMessages = messages.filter((m) => m.tagged_user_id === currentUser.uid);
  const globalMessages = messages;
  const sentMessages = messages.filter((m) => m.sender_id === currentUser.uid);

  const displayMessages = 
    activeTab === 'inbox' ? inboxMessages : 
    activeTab === 'global' ? globalMessages : 
    sentMessages;

  const getRelativeTime = (timestamp: string) => {
    const diffMs = new Date().getTime() - new Date(timestamp).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <>
      {notifPermission === 'default' && showBanner && (
        <div className="notification-banner">
          <div className="notification-banner-content">
            <span>🔔</span>
            <span><strong>Enable desktop notifications</strong> to receive instant alerts when someone tags you.</span>
          </div>
          <div className="notification-banner-actions">
            <button className="btn btn-primary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem', borderRadius: '6px', width: 'auto' }} onClick={handleToggleBrowserNotifications}>
              Enable
            </button>
            <button className="btn btn-secondary" style={{ padding: '0.35rem 0.5rem', fontSize: '0.8rem', width: 'auto', border: 'none', background: 'none' }} onClick={() => setShowBanner(false)}>
              Dismiss
            </button>
          </div>
        </div>
      )}
      {/* Navigation Header */}
      <header className="navbar">
        <div className="nav-brand">
          <span>⚡</span> NotiReact
        </div>
        <div className="nav-user">
          <div className="avatar-badge">
            {profile?.username ? profile.username.slice(0, 2).toUpperCase() : 'ME'}
          </div>
          <button className="btn btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={handleSignOut}>
            Log Out
          </button>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="dashboard-grid">
        
        {/* Sidebar Info Panel */}
        <section className="profile-card glass-container">
          <div className="profile-header">
            <div className="avatar-badge" style={{ width: '48px', height: '48px', fontSize: '1.2rem' }}>
              {profile?.username ? profile.username.slice(0, 2).toUpperCase() : 'U'}
            </div>
            <div className="profile-header-info">
              {editingUsername ? (
                <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <input
                    type="text"
                    className="input-control"
                    style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                  />
                  <button className="btn btn-primary" style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem' }} onClick={handleUpdateUsername}>Save</button>
                  <button className="btn btn-secondary" style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem' }} onClick={() => setEditingUsername(false)}>✕</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <h3>@{profile?.username || 'user'}</h3>
                  <button 
                    style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.8rem' }}
                    onClick={() => {
                      setTempUsername(profile?.username || '');
                      setEditingUsername(true);
                    }}
                  >
                    ✏️
                  </button>
                </div>
              )}
              <p>{currentUser.email}</p>
            </div>
          </div>

          <div className="stat-group">
            <div className="stat-box">
              <span className="stat-val">{sentMessages.length}</span>
              <span className="stat-label">Sent</span>
            </div>
            <div className="stat-box">
              <span className="stat-val">{inboxMessages.length}</span>
              <span className="stat-label">Mentions</span>
            </div>
          </div>

          <div className="noti-settings">
            <h4>Alert Channels</h4>
            <div className="noti-toggle-container">
              <span className="noti-toggle-label">Browser Notifications</span>
              <button 
                onClick={handleToggleBrowserNotifications}
                className={`badge-status ${
                  notifPermission === 'granted' ? 'enabled' : 
                  notifPermission === 'denied' ? 'blocked' : 'disabled'
                }`}
                style={{ border: 'none', cursor: 'pointer' }}
              >
                {notifPermission === 'granted' ? 'Enabled' : 
                 notifPermission === 'denied' ? 'Blocked (Reset)' : 'Disabled'}
              </button>
            </div>
            <div className="noti-toggle-container">
              <span className="noti-toggle-label">Realtime In-app Sound</span>
              <span className="badge-status enabled">Active</span>
            </div>
          </div>
        </section>

        {/* Messaging & Chat List Panel */}
        <section className="feed-panel">
          
          {/* Post Message Box */}
          <div className="compose-card glass-container">
            <form onSubmit={handleSendMessage}>
              <textarea
                id="compose-box"
                className="compose-textarea"
                placeholder="Type a message. Tag other users by typing @..."
                value={composeContent}
                onChange={handleComposeChange}
                onKeyDown={handleComposeKeyDown}
                rows={3}
                required
              />

              {/* Mentions Dropdown Suggestions */}
              {showAutocomplete && filteredSuggestions.length > 0 && (
                <div className="autocomplete-dropdown">
                  {filteredSuggestions.map((p, idx) => (
                    <div
                      key={p.id}
                      className={`autocomplete-item ${idx === autocompleteIndex ? 'active' : ''}`}
                      onClick={() => insertMention(p.username)}
                    >
                      <span className="autocomplete-username">@{p.username}</span>
                      <span className="autocomplete-email">{p.email}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="compose-footer">
                <span className="compose-hint">
                  Type <span>@username</span> to send them a notification tag!
                </span>
                <button type="submit" className="btn btn-primary" style={{ width: 'auto', padding: '0.6rem 1.5rem', borderRadius: '8px' }}>
                  Send Message
                </button>
              </div>
            </form>
          </div>

          {/* List Section Tabs */}
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'inbox' ? 'active' : ''}`}
              onClick={() => setActiveTab('inbox')}
            >
              Mentions Inbox
              <span className="tab-count">{inboxMessages.length}</span>
            </button>
            <button 
              className={`tab-btn ${activeTab === 'global' ? 'active' : ''}`}
              onClick={() => setActiveTab('global')}
            >
              Global Feed
              <span className="tab-count">{globalMessages.length}</span>
            </button>
            <button 
              className={`tab-btn ${activeTab === 'sent' ? 'active' : ''}`}
              onClick={() => setActiveTab('sent')}
            >
              Sent Box
              <span className="tab-count">{sentMessages.length}</span>
            </button>
          </div>

          {/* Display Messages List */}
          <div className="message-list">
            {displayMessages.length === 0 ? (
              <div className="empty-state glass-container">
                <p style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>📭 Nothing here yet</p>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                  {activeTab === 'inbox' 
                    ? 'No one has tagged you in a message. Ask another user to tag you!' 
                    : activeTab === 'sent' 
                    ? 'You have not sent any messages. Try typing one above and tagging a user!' 
                    : 'The global chat is currently silent.'}
                </p>
              </div>
            ) : (
              displayMessages.map((msg) => {
                const isMentionForMe = msg.tagged_user_id === currentUser.uid;
                const senderName = msg.sender_username;
                return (
                  <div key={msg.id} className={`message-card glass-container ${isMentionForMe ? 'is-mention' : ''}`}>
                    <div className="avatar-badge" style={{ background: isMentionForMe ? 'linear-gradient(135deg, var(--accent-success), #059669)' : undefined }}>
                      {senderName.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="message-card-body">
                      <div className="message-card-header">
                        <span className="message-sender" onClick={() => handleReplyClick(senderName)}>@{senderName}</span>
                        <span className="message-time">{getRelativeTime(msg.created_at)}</span>
                      </div>
                      <div className="message-content">
                        {renderMessageContent(msg.content)}
                      </div>
                      {msg.sender_id !== currentUser.uid && (
                        <div className="message-actions">
                          <button className="btn-reply" onClick={() => handleReplyClick(senderName)}>
                            ↩️ Reply Tag
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

        </section>
      </main>
    </>
  );
}
