import React from 'react';
import { Stack } from 'expo-router';

export default function ModalsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'modal',
        gestureEnabled: true,
        gestureDirection: 'vertical',
        animation: 'slide_from_bottom',
      }}
    >
      <Stack.Screen 
        name="feed" 
        options={{
          headerShown: false,
          presentation: 'modal',
          gestureEnabled: true,
          gestureDirection: 'vertical',
          animation: 'slide_from_bottom',
        }}
      />
    </Stack>
  );
}
