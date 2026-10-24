import { useEffect, useRef, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useAuth, useClerk } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { dark } from '@clerk/themes';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Logo } from '@/components/kit';
import NotFound from '@/pages/not-found';
import Landing from '@/pages/landing';
import Studio from '@/pages/studio';
import ProjectPage from '@/pages/project';
import Admin from '@/pages/admin';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');

const clerkAppearance = {
  theme: dark,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#5B9BFF',
    colorForeground: '#F7F7F8',
    colorMutedForeground: '#A5A9B1',
    colorDanger: '#EF4B43',
    colorBackground: '#0b0c0e',
    colorInput: '#050506',
    colorInputForeground: '#F7F7F8',
    colorNeutral: '#F7F7F8',
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: '0.375rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#0b0c0e] border border-white/15 rounded-md w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: { fontFamily: "'Outfit', sans-serif", fontWeight: 300, fontSize: '28px', color: '#F7F7F8', letterSpacing: '-0.01em' },
    headerSubtitle: { color: '#A5A9B1' },
    socialButtonsBlockButtonText: { color: '#F7F7F8' },
    formFieldLabel: { color: '#F7F7F8' },
    footerActionLink: { color: '#5B9BFF' },
    footerActionText: { color: '#A5A9B1' },
    dividerText: { color: '#A5A9B1' },
    identityPreviewEditButton: { color: '#5B9BFF' },
    formFieldSuccessText: { color: '#F7F7F8' },
    alertText: { color: '#F7F7F8' },
    logoBox: { height: '48px' },
    logoImage: { height: '48px' },
    formButtonPrimary: { backgroundColor: '#F7F7F8', color: '#0b0c0e', fontWeight: 400, minHeight: '48px' },
    formFieldInput: { minHeight: '48px' },
    socialButtonsBlockButton: { minHeight: '48px', borderColor: 'rgba(255,255,255,0.2)' },
  },
};

function AuthFrame({ children, line }: { children: ReactNode; line: string }) {
  return (
    <div className="grain relative grid min-h-[100dvh] place-items-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-y-0 left-6 hidden w-3 sm:block sprockets" style={{ height: '100%', backgroundImage: 'repeating-linear-gradient(180deg, hsl(var(--border)) 0 14px, transparent 14px 30px)', width: 8 }} />
      <div className="relative z-10 flex w-full flex-col items-center gap-6">
        <a href={basePath || '/'} data-testid="link-home"><Logo size={34} /></a>
        <p className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground">{line}</p>
        {children}
      </div>
    </div>
  );
}
function SignInPage() {
  return <AuthFrame line="Roll camera. Pick up where you left off."><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthFrame>;
}
function SignUpPage() {
  return <AuthFrame line="Your director is ready. Say who you are."><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthFrame>;
}

function Splash() {
  return <div className="grid min-h-[100dvh] place-items-center"><div className="animate-pulse"><Logo size={40} /></div></div>;
}
export function Protected({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <Splash />;
  if (!isSignedIn) return <Redirect to="/" />;
  return <>{children}</>;
}

function CacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prev = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    return addListener(({ user }) => {
      const id = user?.id ?? null;
      if (prev.current !== undefined && prev.current !== id) qc.clear();
      prev.current = id;
    });
  }, [addListener, qc]);
  return null;
}

function RoutedBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: 'Back on set', subtitle: 'Sign in to your shoots' } },
        signUp: { start: { title: 'First day on set', subtitle: 'Create your FRAMES account' } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <CacheInvalidator />
        <TooltipProvider>
          <RoutedBoundary>
            <Switch>
              <Route path="/" component={Landing} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route path="/studio">{() => <Protected><Studio /></Protected>}</Route>
              <Route path="/projects/:id">{() => <Protected><ProjectPage /></Protected>}</Route>
              <Route path="/admin" component={Admin} />
              <Route component={NotFound} />
            </Switch>
          </RoutedBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
