// React and Redux
import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'

// Material UI
import { List, ListItem, ListItemText, ListItemAvatar, Avatar, Chip } from '@mui/material'

const Leaderboard = ({ users, user }) => {
  return (
    <List style={{ width: '100%', flexGrow: 1 }}>
      {users &&
        users.map(({ username, emoji, points }, index) => (
          <ListItem
            key={username}
            selected={username === user.username}
          >
            <ListItemAvatar>
              <Avatar style={{ color: 'black', background: 'none' }}>
                {index === 0 && '🥇'}
                {index === 1 && '🥈'}
                {index === 2 && '🥉'}
                {index > 2 && index + 1}
              </Avatar>
            </ListItemAvatar>
            <ListItemText primary={`${emoji}${username}`} />
            <Chip
              color="secondary"
              size="small"
              label={`${points} Points`}
            />
          </ListItem>
        ))}
    </List>
  )
}

Leaderboard.propTypes = {
  user: PropTypes.object.isRequired,
  users: PropTypes.array.isRequired,
}

const mapStateToProps = (state) => ({
  user: state.auth.user,
})

export default connect(mapStateToProps)(Leaderboard)
