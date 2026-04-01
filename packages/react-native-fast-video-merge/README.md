# VideoMerge Component

This package provides a `VideoMerge` component and utility functions to process and merge videos using FFmpeg in React Native.

## Importing the Functions

You can use the `processAndMergeVideos` and `mergeVideos` functions directly in your own components:

### Example Usage

```javascript
import React, { useState } from 'react';
import { Button } from 'react-native';
import { processAndMergeVideos } from 'react-native-fast-video-merge';

const MyComponent = () => {
  const [recordedVideos, setRecordedVideos] = useState<string[]>([]);

  const handleMergeVideos = async () => {
    const mergedVideoUri = await processAndMergeVideos(recordedVideos);
    console.log('Merged video saved at:', mergedVideoUri);
  };

  return <Button title="Merge Videos" onPress={handleMergeVideos} />;
};

export default MyComponent;
```
