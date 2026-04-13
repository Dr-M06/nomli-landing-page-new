/**
 * MediaTimerRing Component
 * Animated circular timer ring that drains over 24 hours
 * Shows countdown and visual progress around media thumbnails
 */

import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, Animated } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Clock } from 'lucide-react-native'
import { getThemeColors } from '../constants/Colors'
import { useTheme } from '../contexts/ThemeContext'

interface MediaTimerRingProps {
  expiryAt: string
  size?: number
  strokeWidth?: number
  showLabel?: boolean
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export default function MediaTimerRing({ 
  expiryAt, 
  size = 100, 
  strokeWidth = 3,
  showLabel = false 
}: MediaTimerRingProps) {
  const { theme } = useTheme()
  const themeColors = getThemeColors(theme)
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [percentage, setPercentage] = useState<number>(100)
  const [animatedValue] = useState(new Animated.Value(100))

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date().getTime()
      const expiry = new Date(expiryAt).getTime()
      const total = 24 * 60 * 60 * 1000 // 24 hours in milliseconds
      const remaining = expiry - now

      if (remaining <= 0) {
        setTimeLeft(0)
        setPercentage(0)
        return
      }

      setTimeLeft(remaining)
      const newPercentage = (remaining / total) * 100
      setPercentage(newPercentage)

      // Animate the circle
      Animated.timing(animatedValue, {
        toValue: newPercentage,
        duration: 500,
        useNativeDriver: false,
      }).start()
    }

    // Update immediately
    updateTimer()

    // Update every minute
    const interval = setInterval(updateTimer, 60000)

    return () => clearInterval(interval)
  }, [expiryAt])

  const formatTimeLeft = (ms: number): string => {
    const hours = Math.floor(ms / (1000 * 60 * 60))
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))

    if (hours >= 1) {
      return `${hours}h ${minutes}m`
    } else if (minutes > 0) {
      return `${minutes}m`
    } else {
      return 'Expiring soon'
    }
  }

  // Gen Z aesthetic: subtle gradient effect
  const getStrokeColor = (): string => {
    const hoursLeft = timeLeft / (1000 * 60 * 60)
    
    if (hoursLeft < 1) {
      return '#FF6B6B' // Soft red for urgency (Gen Z friendly)
    } else if (hoursLeft < 6) {
      return '#FFB84D' // Warm amber
    } else {
      return 'rgba(255, 255, 255, 0.85)' // Subtle white
    }
  }

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  })

  const strokeColor = getStrokeColor()
  const shouldPulse = timeLeft > 0 && timeLeft < 60 * 60 * 1000 // Pulse under 1 hour

  return (
    <View style={styles.container}>
      <Svg width={size} height={size} style={styles.svg}>
        {/* Ultra-minimal background */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.15)"
          strokeWidth={strokeWidth}
          fill="rgba(0, 0, 0, 0.25)"
        />
        
        {/* Animated progress circle - Gen Z style */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
          opacity={shouldPulse ? 0.9 : 0.95}
        />
      </Svg>

      {/* Clock icon in center */}
      <View style={styles.iconContainer}>
        <Clock 
          size={size * 0.45} 
          color={strokeColor} 
          strokeWidth={2.5}
        />
      </View>

      {showLabel && timeLeft > 0 && (
        <View style={[styles.labelContainer, styles.labelPopup]}>
          <Text style={styles.labelText}>
            {formatTimeLeft(timeLeft)}
          </Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  svg: {
    transform: [{ rotate: '-90deg' }],
  },
  iconContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelPopup: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    top: -32,
    minWidth: 55,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
})

