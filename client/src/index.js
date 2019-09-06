// React
import React from 'react'
import ReactDOM from 'react-dom'

// Redux
import { Provider } from 'react-redux'
import store from './store'

// Material UI
import CssBaseline from '@material-ui/core/CssBaseline'
import ThemeProvider from '@material-ui/styles/ThemeProvider'
import theme from './theme'

// Import App
import App from './App'

// Import Service Worker
import * as serviceWorker from './serviceWorker'

ReactDOM.render(
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Provider store={store}>
      <App />
    </Provider>
  </ThemeProvider>,
  document.getElementById('root')
)

serviceWorker.register()
