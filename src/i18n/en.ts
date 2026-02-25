export default {
  // App
  app: {
    title: 'VR Scout',
    subtitle: 'Virtual Location Scouting',
  },

  // Auth
  auth: {
    signIn: 'Sign In',
    signUp: 'Create Account',
    signOut: 'Sign Out',
    guest: 'Guest Mode',
    continueAsGuest: 'Continue as Guest',
    createAccount: 'Create Account',
    email: 'Email',
    password: 'Password',
    displayName: 'Display Name',
    pleaseWait: 'Please wait...',
    loading: 'Loading...',
    localMode: 'Running in local mode. Data stored in browser only.',
    signInWithGoogle: 'Sign in with Google',
  },

  // Tools
  tools: {
    navigate: 'Navigate',
    measure: 'Measure',
    annotate: 'Annotate',
    camera: 'Camera',
    screenshot: 'Screenshot',
    sunpath: 'Sun Path',
    floorplan: 'Floor Plan',
    laser: 'Laser',
    compare: 'Compare',
  },

  // Toolbar
  toolbar: {
    clearMeasurements: 'Clear measurements',
    toggleUnit: 'Toggle measurement unit',
    settings: 'Settings',
    gallery: 'Screenshot Gallery',
    dashboard: 'Dashboard',
    subscription: 'Subscription',
  },

  // Settings
  settings: {
    title: 'Settings',
    display: 'Display',
    quality: 'Quality',
    controls: 'Controls',
    movementSpeed: 'Movement Speed',
    mouseSensitivity: 'Mouse Sensitivity',
    measurementUnit: 'Measurement Unit',
    meters: 'Meters',
    feet: 'Feet',
    audio: 'Audio',
    voiceChat: 'Voice Chat',
    account: 'Account',
  },

  // Annotations
  annotations: {
    power: 'Electrical Panel/Outlet',
    parking: 'Vehicle Access/Parking',
    sound: 'Sound Issue (AC, traffic)',
    light: 'Natural Light Source',
    access: 'Load-in/Access Point',
    ceiling: 'Ceiling Height',
    restriction: 'Restriction/Limitation',
    custom: 'Custom Note',
    title: 'Title',
    description: 'Description',
    visibility: 'Visibility',
    private: 'Private',
    team: 'Team',
    public: 'Public',
    addAnnotation: 'Add Annotation',
    selectType: 'Select Type',
  },

  // Camera
  camera: {
    spawnCamera: 'Spawn Camera',
    maxCameras: 'Maximum 3 cameras',
    lens: 'Lens',
    ultraWide: '18mm Ultra Wide',
    wide: '24mm Wide',
    standard: '35mm Standard',
    normal: '50mm Normal',
    portrait: '85mm Portrait',
    telephoto: '135mm Telephoto',
  },

  // Sun Path
  sunpath: {
    timeOfDay: 'Time of Day',
    date: 'Date',
    morningGolden: 'Morning Golden Hour',
    eveningGolden: 'Evening Golden Hour',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    noon: 'Noon',
  },

  // Scenes
  scenes: {
    selectScene: 'Select Scene',
    loadScene: 'Load Scene',
    triangles: 'triangles',
    noScenes: 'No scenes available',
  },

  // Environment
  environment: {
    title: 'Environment',
    preset: 'Preset',
    ambientLight: 'Ambient Light',
    directionalLight: 'Directional Light',
    fog: 'Fog Distance',
    showBackground: 'Show Background',
    showGrid: 'Show Grid',
  },

  // Collaboration
  collaboration: {
    createSession: 'Create Session',
    joinSession: 'Join Session',
    leaveSession: 'Leave Session',
    accessCode: 'Access Code',
    participants: 'Participants',
    connected: 'Connected',
    disconnected: 'Disconnected',
    voiceChat: 'Voice Chat',
    mute: 'Mute',
    unmute: 'Unmute',
  },

  // Dashboard
  dashboard: {
    title: 'Dashboard',
    tours: 'Tours',
    analytics: 'Analytics',
    newTour: '+ New Tour',
    editTour: 'Edit Tour',
    deleteTour: 'Delete',
    publishTour: 'Publish',
    viewTour: 'View',
    saveTour: 'Save Changes',
    createTour: 'Create Tour',
    locationId: 'Location ID',
    gpsLatitude: 'GPS Latitude',
    gpsLongitude: 'GPS Longitude',
    sceneFile: 'Scene File (.glb)',
    dropFile: 'Drop a .glb file here or click to browse',
    uploading: 'Uploading...',
    sceneUploaded: 'Scene uploaded',
    qcChecklist: 'QC Checklist',
    noTours: 'No tours yet',
    createFirst: 'Create your first tour to get started',
  },

  // QC Checklist
  qc: {
    noArtifacts: 'No floating artifacts',
    fullCoverage: 'Full spatial coverage',
    accurateLighting: 'Accurate lighting / natural colors',
    calibratedScale: 'Calibrated scale',
    fileSizeOk: 'File size within targets',
    lodGenerated: 'LOD versions generated',
    viewpointsMarked: 'Key viewpoints marked',
    annotationsAdded: 'Production annotations added',
  },

  // Subscription
  subscription: {
    title: 'Subscription Plans',
    choosePlan: 'Choose a plan to unlock all features',
    currentPlan: 'Current plan',
    free: 'Free',
    scout: 'Scout',
    studio: 'Studio',
    perMonth: '/month',
    upgradeTo: 'Upgrade to',
    currentPlanLabel: 'Current Plan',
    stripeNotConfigured: 'Stripe is not configured. Plans are shown for reference only.',
    manageSubscription: 'Manage subscription',
    status: 'Status',
    renews: 'Renews',
    cancels: 'Cancels',
  },

  // Common
  common: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    close: 'Close',
    back: 'Back',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    confirm: 'Confirm',
    draft: 'draft',
    published: 'published',
    enterVR: 'Enter VR',
  },
} as const
