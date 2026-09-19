import { Auth0Provider } from '@auth0/auth0-react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Auth0 comes back from Universal Login with ?code=&state= on the URL. Drop
// them once the SDK has consumed them, so a refresh doesn't replay the
// callback, and keep the #tab the app stores in the hash.
const onRedirectCallback = () => {
  history.replaceState(null, '', location.pathname + location.hash)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={import.meta.env.VITE_AUTH0_DOMAIN}
      clientId={import.meta.env.VITE_AUTH0_CLIENT_ID}
      authorizationParams={{
        redirect_uri: window.location.origin,
        // Without an audience Auth0 returns an opaque token the Express API
        // cannot verify. This asks for a JWT minted for our own API.
        audience: import.meta.env.VITE_AUTH0_AUDIENCE,
      }}
      onRedirectCallback={onRedirectCallback}
      // Refresh tokens kept in localStorage: the session survives a reload
      // even though Chrome blocks the third-party cookies silent renewal
      // would otherwise need.
      useRefreshTokens
      cacheLocation="localstorage"
    >
      <App />
    </Auth0Provider>
  </StrictMode>,
)
