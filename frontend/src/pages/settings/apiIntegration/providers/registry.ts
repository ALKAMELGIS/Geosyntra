import type { AuthType, ProviderConfig, ProviderId } from '../types'

const SECRET = true

function fields(...defs: import('../types').TokenFieldDef[]): import('../types').TokenFieldDef[] {
  return defs
}

function field(
  id: string,
  label: string,
  opts: Partial<import('../types').TokenFieldDef> = {},
): import('../types').TokenFieldDef {
  return { id, label, kind: 'text', required: false, secret: false, ...opts }
}

const apiKeyOnly = (label: string, id = 'apiKey'): import('../types').TokenFieldDef[] => [
  field(id, label, { required: true, secret: SECRET, kind: 'password' }),
]

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'mapbox',
    label: 'Mapbox',
    category: 'gis',
    iconClass: 'fa-solid fa-map',
    description: 'Vector tiles, styles, and geocoding APIs.',
    capabilities: ['Tiles', 'Geocoding', 'Directions'],
    defaultBaseUrl: 'https://api.mapbox.com',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'mapboxToken',
    fieldsByAuth: {
      api_key: fields(
        field('accessToken', 'Access token', {
          required: true,
          secret: SECRET,
          kind: 'password',
          hint: 'mapbox.com → Account → Access tokens',
        }),
      ),
    },
  },
  {
    id: 'arcgis_online',
    label: 'ArcGIS Online',
    category: 'gis',
    iconClass: 'fa-solid fa-globe',
    description: 'Portal services, hosted layers, and OAuth apps.',
    capabilities: ['Portal', 'Feature layers', 'OAuth2'],
    defaultBaseUrl: 'https://www.arcgis.com',
    authTypes: ['api_key', 'oauth2', 'client_credentials', 'username_password'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'arcgisPortalToken',
    fieldsByAuth: {
      api_key: fields(
        field('portalUrl', 'Portal URL', { kind: 'url', placeholder: 'https://www.arcgis.com' }),
        field('apiKey', 'ArcGIS API key', { required: true, secret: SECRET, kind: 'password' }),
      ),
      oauth2: fields(
        field('portalUrl', 'Portal URL', { kind: 'url', placeholder: 'https://www.arcgis.com' }),
        field('clientId', 'Client ID', { required: true }),
        field('clientSecret', 'Client secret', { required: true, secret: SECRET, kind: 'password' }),
      ),
      client_credentials: fields(
        field('portalUrl', 'Portal URL', { kind: 'url', required: true }),
        field('clientId', 'Client ID', { required: true }),
        field('clientSecret', 'Client Secret', { required: true, secret: SECRET, kind: 'password' }),
      ),
      username_password: fields(
        field('portalUrl', 'Portal URL', { kind: 'url', required: true }),
        field('username', 'Username', { required: true }),
        field('password', 'Password', { required: true, secret: SECRET, kind: 'password' }),
      ),
    },
  },
  {
    id: 'arcgis_enterprise',
    label: 'ArcGIS Enterprise',
    category: 'gis',
    iconClass: 'fa-solid fa-server',
    description: 'On-prem portal and federated services.',
    capabilities: ['Enterprise', 'Portal', 'OAuth2'],
    authTypes: ['oauth2', 'username_password', 'api_key'],
    defaultAuthType: 'oauth2',
    fieldsByAuth: {
      oauth2: fields(
        field('portalUrl', 'Portal URL', { kind: 'url', required: true }),
        field('clientId', 'Client ID', { required: true }),
        field('clientSecret', 'Client Secret', { required: true, secret: SECRET, kind: 'password' }),
        field('redirectUrl', 'OAuth Redirect URL', { kind: 'url' }),
      ),
      username_password: fields(
        field('portalUrl', 'Portal URL', { kind: 'url', required: true }),
        field('username', 'Username', { required: true }),
        field('password', 'Password', { required: true, secret: SECRET, kind: 'password' }),
      ),
      api_key: apiKeyOnly('ArcGIS API Key', 'apiKey'),
    },
  },
  {
    id: 'google_maps',
    label: 'Google Maps',
    category: 'gis',
    iconClass: 'fa-brands fa-google',
    description: 'Maps JavaScript API and Places.',
    capabilities: ['Maps', 'Places', 'Routes'],
    defaultBaseUrl: 'https://maps.googleapis.com',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'googleMapsApiKey',
    fieldsByAuth: { api_key: apiKeyOnly('Google Maps API Key') },
  },
  {
    id: 'cesium_ion',
    label: 'Cesium Ion',
    category: 'gis',
    iconClass: 'fa-solid fa-cube',
    description: '3D tiles and terrain hosting.',
    capabilities: ['3D Tiles', 'Terrain'],
    defaultBaseUrl: 'https://api.cesium.com',
    authTypes: ['bearer'],
    defaultAuthType: 'bearer',
    vaultTypeId: 'cesiumIonToken',
    fieldsByAuth: { bearer: fields(field('accessToken', 'Cesium Ion Token', { required: true, secret: SECRET, kind: 'password' })) },
  },
  {
    id: 'here_maps',
    label: 'HERE Maps',
    category: 'gis',
    iconClass: 'fa-solid fa-location-dot',
    description: 'Routing, geocoding, and map tiles.',
    capabilities: ['Routing', 'Geocoding'],
    defaultBaseUrl: 'https://geocode.search.hereapi.com',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    fieldsByAuth: { api_key: apiKeyOnly('HERE API Key') },
  },
  {
    id: 'sentinel_hub',
    label: 'Sentinel Hub',
    category: 'satellite',
    iconClass: 'fa-solid fa-satellite',
    description: 'EO processing, WMS, and OAuth APIs.',
    capabilities: ['WMS', 'Processing API', 'OAuth2'],
    defaultBaseUrl: 'https://services.sentinel-hub.com',
    authTypes: ['oauth2', 'client_credentials', 'api_key'],
    defaultAuthType: 'oauth2',
    vaultTypeId: 'sentinelHubAccessToken',
    fieldsByAuth: {
      oauth2: fields(
        field('clientId', 'Client ID', { required: true }),
        field('clientSecret', 'Client secret', { required: true, secret: SECRET, kind: 'password' }),
        field('instanceId', 'Instance ID', { required: true, hint: 'Sentinel Hub dashboard → User settings' }),
      ),
      client_credentials: fields(
        field('clientId', 'Client ID', { required: true }),
        field('clientSecret', 'Client Secret', { required: true, secret: SECRET, kind: 'password' }),
        field('instanceId', 'Instance ID', { required: true }),
      ),
      api_key: fields(field('accessToken', 'Access Token', { required: true, secret: SECRET, kind: 'password' })),
    },
  },
  {
    id: 'planet_labs',
    label: 'Planet Labs',
    category: 'satellite',
    iconClass: 'fa-solid fa-planet-ringed',
    description: 'Daily satellite imagery catalog.',
    capabilities: ['Imagery', 'Orders'],
    defaultBaseUrl: 'https://api.planet.com',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'planetLabsApiKey',
    fieldsByAuth: { api_key: apiKeyOnly('Planet API Key') },
  },
  {
    id: 'earth_engine',
    label: 'Google Earth Engine',
    category: 'satellite',
    iconClass: 'fa-solid fa-earth-americas',
    description: 'Planetary-scale geospatial analysis.',
    capabilities: ['Analysis', 'Catalog'],
    authTypes: ['oauth2', 'api_key'],
    defaultAuthType: 'oauth2',
    fieldsByAuth: {
      oauth2: fields(
        field('clientId', 'Client ID', { required: true }),
        field('clientSecret', 'Client Secret', { required: true, secret: SECRET, kind: 'password' }),
      ),
      api_key: apiKeyOnly('Service Account Key JSON', 'serviceAccount'),
    },
  },
  {
    id: 'maxar',
    label: 'Maxar',
    category: 'satellite',
    iconClass: 'fa-solid fa-satellite-dish',
    description: 'High-resolution commercial imagery.',
    capabilities: ['Imagery'],
    authTypes: ['api_key', 'basic'],
    defaultAuthType: 'api_key',
    fieldsByAuth: {
      api_key: apiKeyOnly('Maxar API Key'),
      basic: fields(
        field('username', 'Username', { required: true }),
        field('password', 'Password', { required: true, secret: SECRET, kind: 'password' }),
      ),
    },
  },
  {
    id: 'copernicus',
    label: 'Copernicus / NASA EarthData',
    category: 'satellite',
    iconClass: 'fa-solid fa-cloud',
    description: 'Open EO data access tokens.',
    capabilities: ['Download', 'Catalog'],
    authTypes: ['bearer', 'api_key'],
    defaultAuthType: 'bearer',
    vaultTypeId: 'nasaEarthDataToken',
    fieldsByAuth: {
      bearer: fields(field('accessToken', 'EarthData Token', { required: true, secret: SECRET, kind: 'password' })),
      api_key: apiKeyOnly('EarthData API Key'),
    },
  },
  {
    id: 'landsat',
    label: 'Landsat APIs',
    category: 'satellite',
    iconClass: 'fa-solid fa-image',
    description: 'USGS Landsat scene access.',
    capabilities: ['Scenes', 'Metadata'],
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    fieldsByAuth: { api_key: apiKeyOnly('USGS API Key') },
  },
  {
    id: 'openweather',
    label: 'OpenWeatherMap',
    category: 'weather',
    iconClass: 'fa-solid fa-cloud-sun',
    description: 'Weather forecasts and current conditions.',
    capabilities: ['Forecast', 'Current', 'Historical'],
    defaultBaseUrl: 'https://api.openweathermap.org',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'openWeatherMapApiKey',
    dataMappingFields: [
      { id: 'maxTemp', label: 'maxTemp', placeholder: 'data.temperature.max' },
      { id: 'minTemp', label: 'minTemp', placeholder: 'data.temperature.min' },
      { id: 'avgRH', label: 'avgRH', placeholder: 'data.humidity.average' },
      { id: 'rainfall', label: 'rainfall', placeholder: 'data.rain.1h' },
      { id: 'pressure', label: 'pressure', placeholder: 'data.pressure' },
      { id: 'windSpeed', label: 'windSpeed', placeholder: 'data.wind.speed' },
      { id: 'windDirection', label: 'windDirection', placeholder: 'data.wind.deg' },
      { id: 'clouds', label: 'clouds', placeholder: 'data.clouds.all' },
    ],
    fieldsByAuth: {
      api_key: fields(
        field('apiKey', 'API Key', { required: true, secret: SECRET, kind: 'password' }),
        field('queryParam', 'Query Param Name', { placeholder: 'appid', hint: 'e.g. appid, api_key, key' }),
      ),
    },
  },
  {
    id: 'tomorrow_io',
    label: 'Tomorrow.io',
    category: 'weather',
    iconClass: 'fa-solid fa-cloud-bolt',
    description: 'Hyperlocal weather intelligence.',
    capabilities: ['Realtime', 'Forecast'],
    defaultBaseUrl: 'https://api.tomorrow.io',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    fieldsByAuth: { api_key: apiKeyOnly('Tomorrow.io API Key') },
  },
  {
    id: 'weather_api',
    label: 'WeatherAPI',
    category: 'weather',
    iconClass: 'fa-solid fa-temperature-half',
    description: 'Global weather JSON API.',
    capabilities: ['Forecast', 'Astronomy'],
    defaultBaseUrl: 'https://api.weatherapi.com',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    fieldsByAuth: { api_key: apiKeyOnly('WeatherAPI Key') },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    category: 'ai',
    iconClass: 'fa-solid fa-brain',
    description: 'GPT models and embeddings.',
    capabilities: ['Chat', 'Embeddings', 'Vision'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    authTypes: ['api_key', 'bearer'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'openaiApiKey',
    fieldsByAuth: {
      api_key: fields(
        field('apiKey', 'API key', { required: true, secret: SECRET, kind: 'password' }),
      ),
      bearer: fields(field('accessToken', 'Bearer Token', { required: true, secret: SECRET, kind: 'password' })),
    },
  },
  {
    id: 'claude',
    label: 'Claude (Anthropic)',
    category: 'ai',
    iconClass: 'fa-solid fa-robot',
    description: 'Claude models via Anthropic API.',
    capabilities: ['Chat', 'Tools'],
    defaultBaseUrl: 'https://api.anthropic.com',
    authTypes: ['api_key', 'custom_header'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'claudeApiKey',
    fieldsByAuth: {
      api_key: fields(field('apiKey', 'API key', { required: true, secret: SECRET, kind: 'password' })),
      custom_header: fields(
        field('headerName', 'Header name', { required: true, placeholder: 'x-api-key' }),
        field('headerValue', 'Header value', { required: true, secret: SECRET, kind: 'password' }),
      ),
    },
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    category: 'ai',
    iconClass: 'fa-brands fa-google',
    description: 'Gemini multimodal models.',
    capabilities: ['Chat', 'Vision'],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'geminiApiKey',
    fieldsByAuth: { api_key: apiKeyOnly('Gemini API Key') },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    category: 'ai',
    iconClass: 'fa-solid fa-microchip',
    description: 'DeepSeek chat and code models.',
    capabilities: ['Chat', 'Code'],
    defaultBaseUrl: 'https://api.deepseek.com',
    authTypes: ['api_key', 'bearer'],
    defaultAuthType: 'api_key',
    vaultTypeId: 'deepseekApiKey',
    fieldsByAuth: {
      api_key: apiKeyOnly('DeepSeek API Key'),
      bearer: fields(field('accessToken', 'Bearer Token', { required: true, secret: SECRET, kind: 'password' })),
    },
  },
  {
    id: 'groq',
    label: 'Groq',
    category: 'ai',
    iconClass: 'fa-solid fa-bolt',
    description: 'Low-latency inference API.',
    capabilities: ['Chat', 'Fast inference'],
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    fieldsByAuth: { api_key: apiKeyOnly('Groq API Key') },
  },
  {
    id: 'azure_openai',
    label: 'Azure OpenAI',
    category: 'ai',
    iconClass: 'fa-brands fa-microsoft',
    description: 'Enterprise Azure-hosted OpenAI.',
    capabilities: ['Chat', 'Enterprise'],
    authTypes: ['api_key', 'bearer'],
    defaultAuthType: 'api_key',
    fieldsByAuth: {
      api_key: fields(
        field('apiKey', 'API Key', { required: true, secret: SECRET, kind: 'password' }),
        field('endpoint', 'Azure Endpoint', { kind: 'url', required: true }),
        field('deployment', 'Deployment Name', { required: true }),
        field('apiVersion', 'API Version', { placeholder: '2024-02-15-preview' }),
      ),
      bearer: fields(field('accessToken', 'Bearer Token', { required: true, secret: SECRET, kind: 'password' })),
    },
  },
  {
    id: 'aws_s3',
    label: 'AWS S3',
    category: 'storage',
    iconClass: 'fa-brands fa-aws',
    description: 'Object storage for geospatial assets.',
    capabilities: ['Buckets', 'COG'],
    authTypes: ['api_key', 'client_credentials'],
    defaultAuthType: 'client_credentials',
    fieldsByAuth: {
      client_credentials: fields(
        field('accessKeyId', 'Access Key ID', { required: true }),
        field('secretAccessKey', 'Secret Access Key', { required: true, secret: SECRET, kind: 'password' }),
        field('region', 'Region', { required: true }),
        field('bucket', 'Bucket'),
      ),
      api_key: fields(field('accessKeyId', 'Access Key ID', { required: true }), field('secretAccessKey', 'Secret Access Key', { required: true, secret: SECRET, kind: 'password' })),
    },
  },
  {
    id: 'azure_blob',
    label: 'Azure Blob',
    category: 'storage',
    iconClass: 'fa-brands fa-microsoft',
    description: 'Azure blob storage containers.',
    capabilities: ['Containers', 'SAS'],
    authTypes: ['api_key', 'bearer'],
    defaultAuthType: 'api_key',
    fieldsByAuth: {
      api_key: fields(
        field('connectionString', 'Connection String', { required: true, secret: SECRET, kind: 'password' }),
        field('container', 'Container'),
      ),
      bearer: fields(field('sasToken', 'SAS Token', { required: true, secret: SECRET, kind: 'password' })),
    },
  },
  {
    id: 'minio',
    label: 'MinIO',
    category: 'storage',
    iconClass: 'fa-solid fa-database',
    description: 'S3-compatible object storage.',
    capabilities: ['S3 API'],
    authTypes: ['api_key'],
    defaultAuthType: 'api_key',
    fieldsByAuth: {
      api_key: fields(
        field('endpoint', 'Endpoint', { kind: 'url', required: true }),
        field('accessKey', 'Access Key', { required: true }),
        field('secretKey', 'Secret Key', { required: true, secret: SECRET, kind: 'password' }),
      ),
    },
  },
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    category: 'database',
    iconClass: 'fa-solid fa-elephant',
    description: 'PostGIS-enabled PostgreSQL connection.',
    capabilities: ['PostGIS', 'SQL'],
    authTypes: ['username_password', 'api_key'],
    defaultAuthType: 'username_password',
    vaultTypeId: 'databaseConnectionUri',
    fieldsByAuth: {
      username_password: fields(
        field('connectionUri', 'Connection URI', { required: true, secret: SECRET, kind: 'password', placeholder: 'postgresql://user:pass@host:5432/db' }),
        field('host', 'Host'),
        field('port', 'Port', { kind: 'number' }),
        field('database', 'Database'),
        field('username', 'Username'),
        field('password', 'Password', { secret: SECRET, kind: 'password' }),
      ),
      api_key: fields(field('connectionUri', 'Connection URI', { required: true, secret: SECRET, kind: 'password' })),
    },
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    category: 'database',
    iconClass: 'fa-solid fa-leaf',
    description: 'MongoDB Atlas or self-hosted.',
    capabilities: ['Documents', 'Geospatial'],
    authTypes: ['username_password', 'api_key'],
    defaultAuthType: 'username_password',
    fieldsByAuth: {
      username_password: fields(
        field('connectionUri', 'Connection URI', { required: true, secret: SECRET, kind: 'password' }),
        field('username', 'Username'),
        field('password', 'Password', { secret: SECRET, kind: 'password' }),
      ),
      api_key: apiKeyOnly('API Key'),
    },
  },
]

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderConfig> = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p]),
) as Record<ProviderId, ProviderConfig>

export const PROVIDER_LIST = PROVIDERS

export const PROVIDER_BY_CATEGORY: Record<ProviderConfig['category'], ProviderConfig[]> = {
  gis: PROVIDERS.filter(p => p.category === 'gis'),
  satellite: PROVIDERS.filter(p => p.category === 'satellite'),
  weather: PROVIDERS.filter(p => p.category === 'weather'),
  ai: PROVIDERS.filter(p => p.category === 'ai'),
  storage: PROVIDERS.filter(p => p.category === 'storage'),
  database: PROVIDERS.filter(p => p.category === 'database'),
}

export const CATEGORY_LABELS: Record<ProviderConfig['category'], string> = {
  gis: 'GIS / Mapping',
  satellite: 'Satellite / EO',
  weather: 'Weather',
  ai: 'AI Providers',
  storage: 'Storage',
  database: 'Database',
}

export const AUTH_TYPE_LABELS: Record<AuthType, string> = {
  api_key: 'API Key',
  oauth2: 'OAuth2',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  jwt: 'JWT',
  custom_header: 'Custom Header',
  username_password: 'Username / Password',
  client_credentials: 'Client ID + Secret',
}

export function getProvider(id: ProviderId): ProviderConfig {
  return PROVIDER_REGISTRY[id]
}

export function getFieldsForAuth(provider: ProviderConfig, authType: AuthType) {
  return provider.fieldsByAuth[authType] ?? provider.fieldsByAuth[provider.defaultAuthType] ?? []
}

export function providerFromLegacyTypeId(typeId: string): ProviderId {
  const map: Record<string, ProviderId> = {
    mapboxToken: 'mapbox',
    arcgisPortalToken: 'arcgis_online',
    openWeatherMapApiKey: 'openweather',
    sentinelHubAccessToken: 'sentinel_hub',
    sentinelHubWmsInstanceId: 'sentinel_hub',
    geminiApiKey: 'gemini',
    deepseekApiKey: 'deepseek',
    claudeApiKey: 'claude',
    openaiApiKey: 'openai',
    cesiumIonToken: 'cesium_ion',
    planetLabsApiKey: 'planet_labs',
    nasaEarthDataToken: 'copernicus',
    databaseConnectionUri: 'postgresql',
    googleMapsApiKey: 'google_maps',
  }
  return map[typeId] ?? 'mapbox'
}
