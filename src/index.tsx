/* @refresh reload */
import { render } from 'solid-js/web'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import './themes/palettes.css'
import App from './App.tsx'

const root = document.getElementById('root')

render(() => <App />, root!)
