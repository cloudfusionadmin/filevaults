import React, { useEffect, useState } from "react";
import Uppy, { UppyFile, UploadResult } from "@uppy/core";
import AwsS3 from "@uppy/aws-s3";
import { Dashboard } from "@uppy/react";
import { sha256 } from "crypto-hash";

// Import Uppy styles
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";

// Import your custom styles
import styles from "../styles/FileUploader.module.css";

interface FileUploaderProps {
  onUploadSuccess: (result: UploadResult) => void;
  userId: string;
}

export function FileUploader({ onUploadSuccess, userId }: FileUploaderProps) {
  const [currentStorage, setCurrentStorage] = useState<number>(0);
  const [maxStorage, setMaxStorage] = useState<number>(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);  // Loading state for storage info

  // Fetch storage info from the backend
  useEffect(() => {
    const fetchStorageInfo = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/storage-info'); // Assume API route to get storage info
        if (!response.ok) throw new Error(`Failed to fetch storage info: ${response.statusText}`);
        
        const data = await response.json();
        setCurrentStorage(data.currentStorage || 0);
        setMaxStorage(data.maxStorage || 0);
        setError('');
      } catch (error) {
        console.error('Error fetching storage info:', error);
        setError('Error fetching storage info. Please try again later.');
      } finally {
        setLoading(false);  // Stop loading after storage info is fetched
      }
    };

    fetchStorageInfo();
  }, []);

  const uppy = React.useMemo(() => {
    const uppy = new Uppy({
      autoProceed: false, // Wait for user to click "Upload" before starting
      restrictions: {
        maxFileSize: maxStorage > 0 ? Math.max(0, maxStorage - currentStorage) : null, // Restrict file size to remaining storage
        allowedFileTypes: [
          "image/*",
          "application/pdf",
          "application/msword", // .doc files
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx files
          "text/csv", // .csv files
          "application/vnd.ms-excel", // .xls files
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx files
          "application/zip", // .zip files
          "application/x-zip-compressed", // Compressed .zip files
          "application/octet-stream", // .app files and other binary files
        ],
        maxNumberOfFiles: 5, // Allow up to 5 files at once
      },
    }).use(AwsS3, {
      getUploadParameters: async (file: UppyFile) => {
        try {
          const arrayBuffer = await new Response(file.data).arrayBuffer();
          const response = await fetch("/api/upload", {
            method: "POST",
            headers: {
              accept: "application/json",
            },
            body: JSON.stringify({
              userId,
              filename: file.name,
              fileHash: await sha256(arrayBuffer),
              contentType: file.type,
            }),
          });

          if (!response.ok) throw new Error("Unsuccessful request");

          const data = await response.json();
          return {
            method: data.method,
            url: data.url,
            fields: {},
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
          };
        } catch (err) {
          setError(`Error creating upload parameters: ${err.message}`);
          throw err;
        }
      },
    });

    // Listen for when files are added
    uppy.on('file-added', (file) => {
      const remainingStorage = maxStorage - currentStorage;
      if (remainingStorage <= 0) {
        setError('No available storage.');
        uppy.removeFile(file.id); // Prevent the file from being uploaded
        return;
      }

      if (file.size > remainingStorage) {
        setError(`This file (${(file.size / 1024 / 1024).toFixed(2)} MB) exceeds your available storage (${(remainingStorage / 1024 / 1024).toFixed(2)} MB).`);
        uppy.removeFile(file.id); // Prevent the file from being uploaded
      } else {
        setError(''); // Clear the error if the file fits
      }
    });

    uppy.on("complete", (result) => {
      onUploadSuccess(result);
    });

    return uppy;
  }, [onUploadSuccess, userId, currentStorage, maxStorage]);

  return (
    <div className={styles.uploaderContainer}>
      {loading && <p>Loading storage information...</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>} {/* Display error if any */}
      <Dashboard
        uppy={uppy}
        proudlyDisplayPoweredByUppy={false} // Remove Uppy branding
        theme="dark"
        hideUploadButton={false} // Show the "Upload" button
        hideProgressAfterFinish={false}
        showProgressDetails={true}
        note={`Images, PDFs, DOCX, ZIP, and APP files only. Remaining storage: ${(Math.max(0, maxStorage - currentStorage) / 1024 / 1024).toFixed(2)} MB. Max 5 files.`}
        width={400}
        height={200}
        plugins={[]}
      />
    </div>
  );
}
