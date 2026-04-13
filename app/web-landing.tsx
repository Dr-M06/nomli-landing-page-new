import React, { useEffect } from 'react';
import { Platform, View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/Colors';
import useAuth from '../hooks/useAuth';
import { log, warn, error } from '../utils/productionLogger';


const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function WebLandingPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, isLoaded } = useAuth();

  // Redirect authenticated users to main app
  useEffect(() => {
    if (Platform.OS === 'web' && isLoaded && user) {
      log('[WebLanding] User is authenticated, redirecting to main app');
      router.replace('/(tabs)/community');
    }
  }, [user, isLoaded, router]);

  const handleSignIn = () => {
    router.push('/auth/signin');
  };

  const handleSignUp = () => {
    router.push('/auth/signup');
  };

  const handleExplore = () => {
    router.push('/(tabs)/community');
  };

  const features = [
    {
      icon: '💬',
      title: 'Real-time Messaging',
      description: 'Connect instantly with friends and community members through real-time chat',
    },
    {
      icon: '🌍',
      title: 'Location Discovery',
      description: 'Find other users based on location and shared interests',
    },
    {
      icon: '🔔',
      title: 'Push Notifications',
      description: 'Stay connected with instant notifications',
    },
  ];

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <ScrollView 
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero Section */}
      <LinearGradient
        colors={['#000000', '#0A1929', '#000000']}
        style={styles.heroSection}
      >
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoText}>Nomli Mingle</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity 
              style={styles.headerButton}
              onPress={handleSignIn}
              activeOpacity={0.7}
            >
              <Text style={styles.headerButtonText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.headerButton, styles.headerButtonPrimary]}
              onPress={handleSignUp}
              activeOpacity={0.7}
            >
              <Text style={[styles.headerButtonText, styles.headerButtonTextPrimary]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>Nomli Mingle</Text>
          <Text style={styles.heroTagline}>Beyond borders. Beyond limits.</Text>
          <Text style={styles.heroDescription}>
            A modern social platform that brings people together through real-time communication, 
            and meaningful connections.
          </Text>
          <View style={styles.heroButtons}>
            <TouchableOpacity 
              style={styles.primaryButton}
              onPress={handleSignUp}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>Get Started</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.secondaryButton}
              onPress={handleExplore}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>Explore</Text>
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      {/* Features Section */}
      <View style={styles.featuresSection}>
        <Text style={styles.sectionTitle}>Features</Text>
        <Text style={styles.sectionSubtitle}>
          Everything you need to connect, share, and grow with your community
        </Text>
        <View style={styles.featuresGrid}>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureCard}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <Text style={styles.featureTitle}>{feature.title}</Text>
              <Text style={styles.featureDescription}>{feature.description}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* CTA Section */}
      <View style={styles.ctaSection}>
        <View style={styles.ctaGradient}>
          <Text style={styles.ctaTitle}>Ready to connect?</Text>
          <Text style={styles.ctaDescription}>
            Join thousands of users already connecting on Nomli Mingle
          </Text>
          <TouchableOpacity 
            style={styles.ctaButton}
            onPress={handleSignUp}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaButtonText}>Start Your Journey</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>© 2024 Nomli Mingle. All rights reserved.</Text>
        <Text style={styles.footerTagline}>Beyond borders. Beyond limits.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    flexGrow: 1,
  },
  heroSection: {
    minHeight: '100vh',
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      position: 'relative',
    }),
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 20,
    zIndex: 10,
    ...(Platform.OS === 'web' && {
      pointerEvents: 'auto',
    }),
  },
  logoContainer: {
    flex: 1,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333333',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      userSelect: 'none',
    }),
  },
  headerButtonPrimary: {
    backgroundColor: Colors.primary.main,
    borderColor: Colors.primary.main,
  },
  headerButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  headerButtonTextPrimary: {
    color: '#ffffff',
  },
  heroContent: {
    alignItems: 'center',
    maxWidth: 800,
    paddingHorizontal: 20,
    paddingTop: 120,
    paddingBottom: 80,
    ...(Platform.OS === 'web' && {
      position: 'relative',
      zIndex: 1,
    }),
  },
  heroTitle: {
    fontSize: 72,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -1,
  },
  heroTagline: {
    fontSize: 24,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 24,
    fontStyle: 'italic',
  },
  heroDescription: {
    fontSize: 18,
    color: '#cccccc',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 40,
    maxWidth: 600,
  },
  heroButtons: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.primary.main,
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 160,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      userSelect: 'none',
    }),
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333333',
    minWidth: 160,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      userSelect: 'none',
    }),
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  featuresSection: {
    paddingHorizontal: 40,
    paddingVertical: 80,
    backgroundColor: '#0a0a0a',
  },
  sectionTitle: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 18,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 60,
    maxWidth: 600,
    alignSelf: 'center',
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    maxWidth: 1200,
    alignSelf: 'center',
  },
  featureCard: {
    width: SCREEN_WIDTH > 768 ? '30%' : SCREEN_WIDTH > 480 ? '45%' : '100%',
    minWidth: 280,
    maxWidth: 360,
    backgroundColor: '#1a1a1a',
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
  },
  featureIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  featureTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 12,
  },
  featureDescription: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaSection: {
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  ctaGradient: {
    borderRadius: 24,
    padding: 60,
    alignItems: 'center',
    maxWidth: 800,
    alignSelf: 'center',
    width: '100%',
    backgroundColor: Colors.primary.dark,
  },
  ctaTitle: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
  },
  ctaDescription: {
    fontSize: 18,
    color: '#cccccc',
    textAlign: 'center',
    marginBottom: 32,
  },
  ctaButton: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
      userSelect: 'none',
    }),
  },
  ctaButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: 40,
    paddingVertical: 40,
    backgroundColor: '#000000',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  footerText: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  footerTagline: {
    fontSize: 12,
    color: '#444444',
    fontStyle: 'italic',
  },
});
