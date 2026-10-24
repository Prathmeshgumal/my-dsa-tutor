// Starts the editor as a real app: `npm run build` once, then `npm start`. Settings: see ./config.ts.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { createAppServer, stopAppServer } from './app.ts'
import { ConfigError, loadConfig, type Config } from './config.ts'
import { createLogger } from './log.ts'

const appDir = path.resolve(import.meta.dirname, '..')
const distDir = path.join(appDir, 'dist')

let config: Config
try {
  // Data lives in the project folder unless DATA_DIR says otherwise.
  config = loadConfig({ defaultDataDir: path.resolve(appDir, '..') })
} catch (e) {
  if (!(e instanceof ConfigError)) throw e
  console.error(e.message)
  process.exit(1)
}

if (!existsSync(path.join(distDir, 'index.html'))) console.warn('The page isn’t built yet: run npm run build first.')

const logger = createLogger(config.folders.logs)
process.on('unhandledRejection', (reason) => logger.log('error', 'Unhandled error in the server', reason))

const server = createAppServer(config, { distDir, logger })
server.on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${config.port} is already in use. Set PORT to use another one.` : e.message)
  process.exit(1)
})
server.listen(config.port, config.host, () => {
  console.log(`Editor ready at http://localhost:${config.port} (data in ${config.dataDir})`)
})

// Ctrl+C and `docker stop`: end open requests and runs, then exit.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => void stopAppServer(server).then(() => process.exit(0)))
}
