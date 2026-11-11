import React from 'react';import{createRoot}from'react-dom/client';
import App from '../../src/App';import{AuthProvider,useAuth}from'../../src/context/AuthContext';
function Observe(){const a=useAuth();Object.assign(window,{authState:{id:a.user?.id,profile:a.userProfile,admin:a.isAdmin,loading:a.isLoading,error:a.membershipSyncError,recovery:a.profileRecoveryError},signOutFixture:a.signOut});return null}
createRoot(document.getElementById('root')!).render(<AuthProvider><Observe/><App/></AuthProvider>);
